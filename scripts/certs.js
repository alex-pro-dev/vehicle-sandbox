import { mkdirSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = '.vehicle-sandbox/certs';
mkdirSync(dir, { recursive: true, mode: 0o700 });
if (existsSync(`${dir}/ca.key`)) throw new Error('Certificates already exist. Use the existing set or explicitly remove .vehicle-sandbox/certs to regenerate.');
const openssl = args => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
// Tesla receiver identity parser requires this issuer CN. This is our own local
// test CA, never a Tesla-issued certificate. Only the isolated receiver trusts it.
writeFileSync(`${dir}/ca.cnf`, '[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=TeslaMotors\nO=Vehicle Sandbox Local Test CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
openssl(['req','-x509','-newkey','rsa:2048','-nodes','-days','30','-keyout','ca.key','-out','ca.crt','-config','ca.cnf']);
for (const [name, cn, extension] of [
  ['server','localhost','subjectAltName=DNS:localhost,DNS:host.docker.internal,DNS:receiver,DNS:sandbox,IP:127.0.0.1\nextendedKeyUsage=serverAuth'],
  ['vehicle','SANDB0X0000000001','extendedKeyUsage=clientAuth'],
]) {
  openssl(['req','-new','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,'-out',`${name}.csr`,'-subj',`/CN=${cn}/O=Vehicle Sandbox Synthetic`]);
  writeFileSync(`${dir}/${name}.ext`, `basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n${extension}\n`);
  openssl(['x509','-req','-in',`${name}.csr`,'-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-days','30','-extfile',`${name}.ext`,'-out',`${name}.crt`]);
  chmodSync(`${dir}/${name}.key`, 0o600);
}
chmodSync(`${dir}/ca.key`, 0o600);
console.log(`Generated 30-day local-only certificates in ${dir}`);
