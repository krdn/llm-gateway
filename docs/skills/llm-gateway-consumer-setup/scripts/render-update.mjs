// Run from the consumer root. Print the workflow for inspection before installing it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const gateway = '@krdn/llm-gateway';
const locks = { 'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn' };

function render(node, fallbackVersion) {
  if (!/^\d+$/.test(node) || Number(node) < 22) throw Error('Node.js 메이저 버전(22 이상)을 지정하세요.');
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  if (manifest.name === gateway || ![manifest.dependencies, manifest.devDependencies].some(deps => deps?.[gateway])) {
    throw Error('게이트웨이를 직접 설치한 소비자 패키지 루트에서 실행하세요.');
  }
  const found = Object.keys(locks).filter(file => existsSync(file));
  if (found.length !== 1) throw Error('소비자 루트에 사용할 잠금 파일 하나가 필요합니다.');
  const lock = found[0];
  const manager = locks[lock];
  const pin = manifest.packageManager;
  if (pin !== undefined && (typeof pin !== 'string' || !pin.startsWith(manager + '@'))) {
    throw Error('packageManager와 잠금 파일이 일치하지 않습니다.');
  }
  const version = pin === undefined ? fallbackVersion : pin.slice(manager.length + 1);
  if ((manager !== 'npm' || version !== undefined) &&
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+sha(?:224|256|384|512)\.[a-fA-F0-9]+)?$/.test(version ?? '')) {
    throw Error('프로젝트에서 사용하는 정확한 패키지 매니저 버전을 지정하세요.');
  }
  const command = manager === 'npm'
    ? (version ? 'npm exec --yes --package=npm@' + version.split('+')[0] + ' -- npm' : 'npm')
    : 'corepack ' + (pin ? manager : manager + '@' + version);
  const classic = manager === 'yarn' && version.split('.')[0] === '1';
  const install = { npm: 'ci', pnpm: 'install --frozen-lockfile', yarn: classic ? 'install --frozen-lockfile' : 'install --immutable' }[manager];
  const update = manager === 'yarn' ? (classic ? 'upgrade' : 'up -R') : 'update';
  const commands = [];
  if (manager !== 'npm') {
    if (!pin) commands.push('export COREPACK_ENABLE_AUTO_PIN=0');
    commands.push('if ! command -v corepack >/dev/null; then',
      '  npm install --prefix "$RUNNER_TEMP/gateway-tools" --no-audit --no-fund --ignore-scripts corepack@0.34.5',
      '  export PATH="$RUNNER_TEMP/gateway-tools/node_modules/.bin:$PATH"', 'fi');
  }
  commands.push(command + ' ' + install, (manager === 'yarn' && !classic ? 'YARN_ENABLE_IMMUTABLE_INSTALLS=false ' : '') + command + ' ' + update + ' ' + gateway);
  const paths = ['package.json', lock];
  if (manager === 'yarn') {
    for (const file of ['.pnp.js', '.pnp.cjs', '.pnp.data.json', '.pnp.loader.mjs', '.yarn/cache']) {
      if (execFileSync('git', ['ls-files', '--', file], { encoding: 'utf8' }).trim()) paths.push(file);
    }
  }
  const template = readFileSync(new URL('../templates/update-llm-gateway.yml', import.meta.url), 'utf8');
  return template.replace('{{NODE_VERSION}}', node).replace('{{PR_PATHS}}', paths.join('\n            ')).replace('{{UPDATE_COMMANDS}}', commands.join('\n          '));
}

try {
  process.stdout.write(render(...process.argv.slice(2)));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
