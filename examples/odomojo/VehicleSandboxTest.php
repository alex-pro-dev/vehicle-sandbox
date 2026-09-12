<?php

namespace Tests\Feature;

use App\Integrations\Tesla\TelemetryDecoder;
use App\Models\Connection;
use App\Models\Organisation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Predis\Client;
use Tests\TestCase;

/** External acceptance test: real HTTP, mTLS receiver, Redis and application ingestion. */
class VehicleSandboxTest extends TestCase
{
    use RefreshDatabase;

    private const VIN = 'SANDB0X0000000001';

    private const API = 'http://host.docker.internal:8090';

    private const CONTROL = 'http://host.docker.internal:8099';

    private function control(string $path, array $data = []): array
    {
        $response = Http::timeout(15)->withBody(json_encode((object) $data), 'application/json')->post(self::CONTROL.'/control/'.$path);
        $this->assertTrue($response->successful(), $response->body());

        return $response->json();
    }

    public function test_onboarding_drive_duplicates_pause_resume_and_revocation(): void
    {
        $this->travelTo(now()->startOfSecond());
        $start = now()->toISOString();
        $this->control('reset', ['epoch' => $start]);
        config([
            'tesla.client_id' => 'sandbox-client', 'tesla.client_secret' => 'sandbox-secret',
            'tesla.authorize_url' => self::API.'/oauth2/v3/authorize',
            'tesla.token_url' => self::API.'/oauth2/v3/token', 'tesla.audience' => self::API,
            'tesla.redirect_uri' => 'http://localhost:8091/api/v1/oauth/tesla/callback',
            'tesla.proxy_url' => 'https://host.docker.internal:8444',
            'tesla.proxy_ca' => '/sandbox/.vehicle-sandbox/certs/ca.crt',
            'tesla.telemetry_ca' => '/sandbox/.vehicle-sandbox/certs/ca.crt',
            'tesla.telemetry_host' => 'receiver', 'tesla.telemetry_port' => 4443,
            'tesla.telemetry_enabled' => true,
        ]);
        // Forbid unintended calls to an OEM, while allowing actual local network I/O.
        Http::preventStrayRequests();
        Http::allowStrayRequests([self::API.'/*', self::CONTROL.'/*', 'https://host.docker.internal:8444/*']);
        $user = User::factory()->create();
        $user->forceFill(['two_factor_secret' => encrypt('SANDBOX'), 'two_factor_confirmed_at' => now()])->save();
        $org = Organisation::create(['name' => 'Sandbox acceptance', 'kind' => 'personal', 'timezone' => 'UTC']);
        $org->members()->attach($user, ['role' => 'owner']);
        $this->actingAs($user)->withSession(['purpose' => 'sandbox-acceptance']);
        $prefix = "/api/v1/organisations/$org->id";
        $url = $this->postJson($prefix.'/connections/tesla/authorise')->assertOk()->json('url');
        $page = Http::get($url)->throw()->body();
        preg_match('/name="ticket" value="([^"]+)"/', $page, $matches);
        $consent = Http::asForm()->withoutRedirecting()->post(self::API.'/oauth2/v3/authorize', ['ticket' => $matches[1], 'decision' => 'allow']);
        $this->assertSame(302, $consent->status());
        $this->withCookie(config('session.cookie'), session()->getId());
        $this->get('/api/v1/oauth/tesla/callback?'.parse_url($consent->header('Location'), PHP_URL_QUERY))->assertRedirect('/?connection=ready&organisation='.$org->id);
        // Exercise refresh via real HTTP before discovery.
        $connection = Connection::firstOrFail();
        $oldRefresh = $connection->refresh_token;
        $connection->update(['expires_at' => now()->subMinute()]);
        $this->postJson($prefix.'/connections/tesla/discover')->assertOk()->assertJsonPath('data.0.id', '1');
        $this->assertNotSame($oldRefresh, $connection->fresh()->refresh_token);
        $this->postJson($prefix.'/vehicles', ['vehicles' => ['1'], 'schedule' => 'always', 'acknowledged' => true])->assertCreated();
        $vehicle = $org->vehicles()->firstOrFail();
        $path = $prefix.'/vehicles/'.$vehicle->id;
        $this->assertFalse($vehicle->tracking_enabled);
        $this->assertSame([], $vehicle->snapshot);
        $this->postJson($path.'/tesla/check')->assertOk()->assertJsonPath('paired', false);
        $this->postJson($path.'/tesla/activate', ['version' => 1, 'acknowledged' => true])->assertConflict();
        $this->control('pair', ['paired' => true]);
        $this->postJson($path.'/tesla/check')->assertOk()->assertJsonPath('paired', true);
        $this->assertDatabaseCount('telemetry_events', 0);
        // Advance both test clocks past the application's setup throttle window.
        $this->travel(61)->seconds();
        $this->control('advance', ['seconds' => 61]);
        $this->postJson($path.'/tesla/activate', ['version' => 1, 'acknowledged' => true])->assertOk();
        $this->assertTrue($vehicle->fresh()->tracking_enabled);
        $this->assertSame([], $vehicle->fresh()->snapshot);
        $redis = new Client('tcp://host.docker.internal:6399', ['parameters' => ['read_write_timeout' => 5]]);
        $subscription = $redis->pubSubLoop(['psubscribe' => 'odomojo_V_*']);
        $this->assertSame('psubscribe', $subscription->current()->kind);
        $receive = function () use ($subscription): string {
            $message = $subscription->current();
            $this->assertSame('pmessage', $message->kind);

            return app(TelemetryDecoder::class)->receive($message->channel, $message->payload);
        };
        try {
            $this->control('drive', ['speedKmh' => 36]);
            $this->control('faults', ['copies' => 2]);
            $this->travel(1)->seconds();
            $this->control('advance', ['seconds' => 1]);
            $this->assertSame('accepted', $receive());
            $this->assertSame('duplicate', $receive());
            $this->assertDatabaseCount('telemetry_events', 1);
            $snapshot = $vehicle->fresh()->snapshot;
            $this->assertEqualsWithDelta(36, $snapshot['speed']['value'], 0.00001);
            $this->assertEqualsWithDelta(10000.01, $snapshot['odometer']['value'], 0.00001);
            $this->assertLessThan(80, $snapshot['soc']['value']);
            $this->assertSame(now()->toISOString(), $snapshot['position']['observed_at']);
            // A record buffered before pause must be rejected both while paused and after resume.
            $this->travel(1)->seconds();
            $this->patchJson($path.'/tracking', ['enabled' => false, 'version' => 2])->assertOk();
            $this->control('replay', ['id' => 0]);
            $this->assertSame('denied', $receive());
            $this->travel(1)->seconds();
            $this->patchJson($path.'/tracking', ['enabled' => true, 'version' => 3])->assertOk();
            $this->control('replay', ['id' => 0]);
            $this->assertSame('denied', $receive());
            $this->assertDatabaseCount('telemetry_events', 1);
            // New data with only an odometer must not fabricate a fresh location.
            $this->control('faults', ['copies' => 1, 'missing' => ['Location', 'VehicleSpeed', 'Soc']]);
            $this->travel(58)->seconds();
            $this->control('advance', ['seconds' => 60]);
            $this->assertSame('accepted', $receive());
            $this->assertArrayNotHasKey('position', $vehicle->fresh()->snapshot);
            $this->assertArrayHasKey('odometer', $vehicle->fresh()->snapshot);
            $this->control('revoke');
            $this->postJson($path.'/tesla/check')->assertConflict();
            $this->assertFalse($vehicle->fresh()->tracking_enabled);
            $this->assertSame('reconnect', $connection->fresh()->state);
            $this->control('replay', ['id' => 1]);
            $this->assertSame('denied', $receive());
            $this->assertDatabaseCount('telemetry_events', 2);
        } finally {
            $subscription->stop(true);
        }
    }
}
