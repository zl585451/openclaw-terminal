// Load .env file
import * as dotenv from 'dotenv';
import * as path from 'path';
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

import { app, BrowserWindow, ipcMain, Notification, dialog, screen, globalShortcut } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import { spawn } from 'child_process';
import * as pty from 'node-pty';
import * as crypto from 'crypto';
import WebSocket from 'ws';

let mainWindow: BrowserWindow | null = null;
let floatWindow: BrowserWindow | null = null;
let codeWindow: BrowserWindow | null = null;
let terminalWindow: BrowserWindow | null = null;
let terminalPty: pty.IPty | null = null;
let openclawWs: WebSocket | null = null;
let requestId = 0;
const MAX_RECONNECT_RETRIES = 999; // 增加重连次数上限
let reconnectRetryCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastSessionState: { messages?: any[]; sessionKey?: string } | null = null;
const SESSION_STATE_FILE = path.join(app.getPath('userData'), 'session-state.json');
const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
  OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
  OPENCLAW_TOKEN: '',
};

// 授权码 SHA-256 哈希白名单（格式 OCT-XXXX-XXXX-XXXX，大写字母+数字）
// 将你生成的授权码用 SHA-256 哈希后填入下方，替换 placeholder
const VALID_LICENSE_HASHES: string[] = [
  '674a67891e225ca236349bfe95d20ab349b8009a24751a60ed5c76fd8b798b6b',
  '46e2019bcfd20742b17eb92b3fcdb772b1a3e359c0b0967557c69db5c60be1de',
  'ee1f5ffb4df979a9f269e2e3717d7a9200984fc96d23e73e5f7377b08610debc',
  'ba0279f8da79167255be78e2debad87ed556c27bbe1e9d37c8dfee2dd28042e7',
  '608fad5ca8a5cfadd800c19fc62ddbef06c76fbcd8ca04a5e06cc0b6b9061a61',
  'cef523ec095971ea20faed7d1c1c06ca94ccd72d9cdee040a5c500201537a8ef',
  '66dcb6aae6745e37570d0171efbba370e85dfa23de0cfac7c455fc8ab137d6b2',
  '47fcc68fa85ec091b7cb47dbfe3c892d5123cdfea626b22a8faf2335d5068a3f',
  '8e899173ce304bcea6ba09b34b7964fb46edccdf39de26b559762abf27314b69',
  '23e35846ce9ef849d0187f0dac8c3201439c499aea4d0274c336b73c2a2257ec',
  '505a5defece79a6675f7140bd6773865b8e5d7427c02751c635ed476b8a2a4c6',
  'a995b7ca374612fadad58b29f6fad38ae3cf0f9d6ec5382f2c1d6e7f45bc44b7',
  '4f0d949ea4abcfd27fd22cf77e5be16e8b14d942a0f40f9d6642ae236953226e',
  'c19dd2daa8bbd1d0f61e24a4581a2e34598678585cff3b458c5bba11dedc03d0',
  '9bd553e93053b0c55f8e606b32983393ba3778e009dcfbe27318be5b412a87ad',
  '62cb3168fdef402823dd81e2310b40b6df06cb1b86b07e26bb72d933b9df28d7',
  'eed537352079973e6b7c047d7a5a5c4f1a505f1c9a3a2750c8a3256e775f52c1',
  '45414cff3ed810a38b3b415240ffdb33847741d8f5f2f9e972904ca2206ddc12',
  '135d998b85744f03a4c59223fc6201ee627f74dc6d52dd86913a040289d707f3',
  '781ad5aa3e0b0f85673477e3aef4ad61463a4b5754903239d8483fa0c9940de2',
  '66b66a4520105bbfae7ec40fb6434faefaa64517f332c9f9db3a336f71e6e376',
  '298cd0d49bee93f27df501448a9c3fd75c49f47d592b6c45ab8abb3236adf8eb',
  '6e297dfc31335e3a33e1ae6354ca04b096f907bb92e0ee4c562b0fb39581d98e',
  '5e0beaf82c6e449d05e086b0740385959b9420cb9c22c458b70fa0067b352b70',
  '9c0b1b4f679920b3577ff71deb5d1c0324a37b4e07d65cb93544dd440ee35522',
  'd5bfa49d3d75d7137f6d803e8b85ff2d2b337ad5d77e749c79528bd34944b5d8',
  '297a49d0c4378322d65deef687903c9f3948df4ee1c8edd82f787372da85be0c',
  '1c9a798a3ee8e4d96396e6b57f16b211f1e0c5a81ef76aef865e7e71e542335a',
  '6b0aeeb54ee8307544070d24ddd889cdb78885871df6e09edc1c7e190eca6885',
  '9da731727b3b83a86c41fca6f26feaf50ecdadb6b39ef7cb0cee1dcd16b63c89',
  'c3eb98e48b869e2b00dcb3ee449f6bfc2d42f0d026cce76c62f3a80febed88e9',
  'e8fc40bce5348fe5815930e9f4848fce56088b60614296a9f6b7b8acfc32fdf3',
  'a7902dfbd65a67f46085fa4f8ddf6ece26812a90c041501a4b1237619cf4c3c6',
  'b98b802043c9fbb74035ad6e455f238f78f3125574cb6fe7464adba7ea60dc03',
  'a2316646ac804899ea67f5f6c40a5cf9fffeff87db4842389ba9724ebeededb8',
  '6655c079e502a2eba0f53d84be253bb0bf081feb50303ba099bdb3a81ecd021b',
  'd247459b74d23a2ae6f7a74a65085c079980ae817363f8e50cf88d25157409fb',
  '7f92e5205f1bbb067e79d638f61845258c5a0857bd26b9d9fc32a4793d5cdefb',
  'c006964d041f9df60970e3341acc5a00fc41ed178c8ab248a1110ec799784903',
  'e7c72279e1add0b32f4028eab747afb443eea94dec244085431ea8b7a48cea52',
  '3c124acf98df9013c9a34461c573624ad15d40bc272b0b86089374361c56985f',
  'b8b3968949f471f49db00189fb3c131ca14c71feb8d8576277c279e834abb831',
  'b0a860b63a6717d2981b8037725c51d6232c4e2007a46c43a1d655658adbafd0',
  '1ccd9eaee0075cba2a904a5fd8aeaa1e59b948e1afa629b16fa6590cf9224aae',
  'd0e90c5bb5d6c766cf508196a7f6e5fb67b10cb6d22c3626c884ae95ec755e81',
  '855f9ab0e3ccfc1dabf74cf4018d723771c05c0a5820355a70a15dd765456eb5',
  'a2857a6f9ab1ad00389970b4a8145061f0c4d53a1ed1322e53c56b1d8bc663d9',
  '9b1ef6b7b0f26f0cd95e2441dd6038c3c301c02f31c7d017e98eec6321b39aba',
  'efe311f5a6d955ba19316058576bf1303d9c7b9fead8b70ddc70e800c36bf7b5',
  'eec4f378b6cac6bdc8bf9f8e1640e967d7966aa3c0a50a5737198ab6251c717d',
  '528f177f6c355fbe07f3f8d6cb05ea791f2141ac35b3860d35651291274e096b',
  '8a2672923d95bd4b4b537be8b203610f6b5d70593b51cc7645734933862b6c2a',
  '09248a09f31c01420058c7c9f0b85f8d9900b8bcbf0e1173e2328d0ba26804aa',
  '8b1e8453adea21bd1a22eb196570315eae65db7bf395d45f936100170c978122',
  '2ec68eb1abe5e9801e3430295299456dc089b6e28f8d16dff41f637cda92e1d6',
  'cd6c736c10890a002ab6fb0c3010aa7f041dfbfa8724d14c64a2e96692821d90',
  'afa6cd0989b9680fe1139c209914856f16ca3b6a2f0abb38c585da1b6e052fd2',
  '1de59a868f4c09fe7240574be1f4e919f3121f174dd96a1e5abf90f3c5fdda2b',
  '08a28df6e0ce06e6b42344a8cd6d4934a58f8b2e8b90241bccc9a8b482e70680',
  '5080770e69ec4362f68b2393f333bdd9315892825a5602977815c0762cbc859d',
  '179b3a3fd355ccee080bbcb271504af4dc9dad5df53fe2b5b2dafc714c3793bd',
  '117b52b1fb91734b8c98f704495ee28c59c838f2f6074fd863bdc91a6329f7b9',
  '736197a365bbd3d2f5845fe06e6e7ada44dda86f28d76df25a977253612c3b72',
  'e8c30dd4ef2a0f44b8cc1d6128b3789e67340ca7984e922f407cb0b965812543',
  'db8db8108009a08c886be1b36c9dc91a4d6b323fcca50fb02b67dd9dd28b7027',
  '8e5cd3fb78010f0f41d145fc549604b7f3c75f64cabab2e1ddd46f2d604ac9a3',
  '068c74b815c641ce305995de80c13c7ed737bfad1dd69c6ba0a255884dc2b15f',
  '3da4db2154d27394d2ff6b8383d435c52d673d976708c4bbebeed8c0323ce1c2',
  '5faf17c8eea0a3b3712050932ab71349b46a713b5d0d7d25f8c5e461ebd090bc',
  'fa49ea4cbbc6a7bef0c9e15d9c23cf99184e7249a4057bc95020ab3b3b477994',
  'e912a2b951601740d8552f5685129571f97f5e6af4a77a677fc4b7e6262ef9b8',
  '4f46eae22a102e98c6e2174365938da3670ad850f986c19cd2bde25ce8c678b3',
  'cfb8213970c94e2d1dc5478368614324cafe61a8ea0cd9a58a276fe79e90b93a',
  '43901fd120a0da01ca0fada05060401f5052431816341bd065b0fe2e96b78a43',
  '3bf48b8c0286db211f7bd1cabd2e328a5d1f0cd5a1c70c0a8c06417de299ebb3',
  'eaea2d88aeb141adef525083d0e5d30ef1434f1ac7cfc4c7abe1ac888a6c23f0',
  '38717bbb73d1599e20212b5e0abb34a4d0c548db9c5c5d6e20d2f17d04de4c2b',
  '09d0d51d0b46ce3eb5aa4fd99ed6bb8598c8081f170ff2c456c87acd33e7cdda',
  'd4453c4cceae77ba09488393ee2cdbb11a3fc41b08be88a388b12a56c03e720c',
  'c79cd67b60f011d94df0b728b2199ac327b78fdf96623541fa84cbe7ff674ac6',
  '00f086ab5ef951a20a4d54dc1b178d3b1e7ce0dbcbd960d8d797e4e26f249963',
  'c81935913e2b402018fbf51be2ae40b71a30813a5b9c0c949fe728d9121c74d8',
  'bb913b3ece92dc40d3e681cd1380cae283e8b71d187517a55945e494bac84266',
  '3ec7c77e45660b0f55b272aba68eadde98313db6fb1e58b26a41150b734c16c1',
  '53071993ea65f27685a17030f643f52d899813863e62b08d3841a4308732f57a',
  '21994d1c3e308c530a68ce5ca96aabfb55edb8e87094bc6532f24bdffb15ceab',
  '45acbe90a4156ade294742c9078d2ba64dd3810a0a6a87444fc0eff3629178ea',
  '72d646815c305232f522ac533e29141a795ebeab903c51520a6dc5723caff5c5',
  '1bbbe90586a7b28a939728a3ff8a8ac8cc4632bf27f2f28e834802a239071a30',
  '5a87be2a29042dd171bf137bba6930639ac6489403ad99095b009fe1d70412cd',
  '02f74c42a0e483f473c42370a95709810caa4e446e49c31f57217f4592755f23',
  '0366925a5a4f158268b94926cbc59b540f5d786154feb829d7fe9a49e73db911',
  'c459f1e701508a5a1f4e7b94972284ca67ee47455d36f76b82b457f20bef173d',
  '5f007e45fbf2d66e9348a0d42457ce8dec367f2eaf35c3914dc03057359cac17',
  'cef6bc185ec0a7958f8235892a8aecc008449eb2494cf055e6f47b7a8d268ce5',
  'bdb13e286c1d4dcf5ce6800f587038afa568b425b63e6ea0fd4869e6a9490290',
  'dde9e19bae49208b4a14e2b1af0429adbf3b93a4d03a405a9ef7b2ae1d3290bf',
  '333523653a30b69652fd1f38c1a3db22cc0eddf4a2a30b4851174b2e2feaef77',
  '8f9df314d628dbadb29f9bbf3f16b42e1cc3161dbeadb689fea194025f5a38b0',
  '71c21c312e64407ec7a89e9c87d09ffc09c537799d6c27eda21f396d28c03066'
];

// Gateway 进程管理
const GATEWAY_PORT = 18789;
const GATEWAY_CMD = path.join(os.homedir(), '.openclaw', 'gateway.cmd');

// 内嵌 OpenClaw 路径（打包后在 resources/openclaw，开发时在项目根/resources/openclaw）
function getEmbeddedOpenClawEntry(): string | null {
  const candidates = [
    // 打包后
    path.join(process.resourcesPath || '', 'openclaw', 'node_modules', 'openclaw', 'dist', 'index.js'),
    // 开发时
    path.join(__dirname, '..', 'resources', 'openclaw', 'node_modules', 'openclaw', 'dist', 'index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 获取内嵌 OpenClaw 的工作目录（用户数据目录 ~/.openclaw）
function getOpenClawWorkDir(): string {
  const dir = path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('[Gateway] Created OpenClaw workdir:', dir);
  }
  return dir;
}

// 初始化：如果用户没有 config.json，从内嵌默认配置复制
function initOpenClawUserData(): void {
  const userConfigPath = path.join(os.homedir(), '.openclaw', 'config.json');
  if (!fs.existsSync(userConfigPath)) {
    const defaultConfigCandidates = [
      path.join(process.resourcesPath || '', 'openclaw', 'defaults', 'config.json'),
      path.join(__dirname, '..', 'resources', 'openclaw', 'defaults', 'config.json'),
    ];
    for (const src of defaultConfigCandidates) {
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, userConfigPath);
          console.log('[Gateway] Initialized user config from default:', src);
        } catch (e) {
          console.warn('[Gateway] Failed to copy default config:', e);
        }
        break;
      }
    }
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onConnect = () => { socket.destroy(); resolve(true); };
    const onError = () => { socket.destroy(); resolve(false); };
    socket.setTimeout(800);
    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}
let gatewayProcess: ReturnType<typeof spawn> | null = null;
let gatewayManagedByUs = false; // 是否由本程序启动

// OpenClaw WebSocket config：优先从 userData/config.json 读取，打包后 .env 不存在时使用
let OPENCLAW_WS_URL = 'ws://127.0.0.1:18789';
let OPENCLAW_TOKEN = '';

function ensureConfigFile(): void {
  if (fs.existsSync(CONFIG_FILE)) return;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    console.log('[Config] Created default config.json at', CONFIG_FILE);
  } catch (e) {
    console.warn('[Config] Failed to create config.json:', e);
  }
}

function loadOpenClawConfig(): void {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      OPENCLAW_WS_URL = (data.OPENCLAW_WS_URL || '').trim() || DEFAULT_CONFIG.OPENCLAW_WS_URL;
      OPENCLAW_TOKEN = typeof data.OPENCLAW_TOKEN === 'string' ? (data.OPENCLAW_TOKEN || '').trim() : '';
    } catch (e) {
      console.warn('[Config] Failed to load config.json:', e);
    }
  } else if (fs.existsSync(envPath)) {
    OPENCLAW_WS_URL = (process.env.OPENCLAW_WS_URL || '').trim() || DEFAULT_CONFIG.OPENCLAW_WS_URL;
    OPENCLAW_TOKEN = (process.env.OPENCLAW_TOKEN || '').trim();
  } else {
    ensureConfigFile();
    OPENCLAW_WS_URL = DEFAULT_CONFIG.OPENCLAW_WS_URL;
    OPENCLAW_TOKEN = DEFAULT_CONFIG.OPENCLAW_TOKEN;
  }
}

// Device identity
let deviceKeys: { publicKeyPem: string; privateKeyPem: string; deviceId: string } | null = null;
const KEYS_FILE = path.join(app.getPath('userData'), 'device_keys.json');

// Generate Ed25519 keypair and device ID
function generateNewKeys(): { publicKeyPem: string; privateKeyPem: string; deviceId: string } {
  console.log('[OpenClaw] Generating new Ed25519 keypair...');
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  
  // Device ID = SHA-256 of raw public key (32 bytes after SPKI prefix)
  const rawKey = extractRawPublicKey(publicKeyPem);
  const deviceId = crypto.createHash('sha256').update(rawKey).digest('hex');
  
  return { publicKeyPem, privateKeyPem, deviceId };
}

// Extract raw 32-byte public key from SPKI PEM
function extractRawPublicKey(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer;
  // Ed25519 SPKI DER: 12 bytes prefix + 32 bytes raw key
  // Prefix: 30 2a 30 05 06 03 2b 65 70 03 21 00
  return spki.subarray(-32);
}

// Base64URL encode
function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// Save session state to file
function saveSessionState(state: { messages?: any[]; sessionKey?: string }) {
  try {
    lastSessionState = state;
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    console.log('[Session] State saved to:', SESSION_STATE_FILE);
  } catch (e) {
    console.warn('[Session] Failed to save state:', e);
  }
}

// Load session state from file
function loadSessionState(): { messages?: any[]; sessionKey?: string } | null {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf-8'));
      console.log('[Session] State loaded from:', SESSION_STATE_FILE);
      return data;
    }
  } catch (e) {
    console.warn('[Session] Failed to load state:', e);
  }
  return null;
}

// ===== License 授权验证 =====
function getLicensePath(): string {
  return LICENSE_FILE;
}

function isLicenseActivated(): boolean {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf-8'));
    return !!(data?.activated === true);
  } catch {
    return false;
  }
}

function verifyLicenseCode(code: string): { valid: boolean; error?: string } {
  const trimmed = (code || '').trim().toUpperCase();
  if (!trimmed || !/^OCT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(trimmed)) {
    return { valid: false, error: '授权码格式错误，应为 OCT-XXXX-XXXX-XXXX' };
  }
  const hash = crypto.createHash('sha256').update(trimmed).digest('hex');
  if (!VALID_LICENSE_HASHES.includes(hash)) {
    return { valid: false, error: '授权码无效' };
  }
  return { valid: true };
}

function saveLicenseActivated(): void {
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify({
      activated: true,
      activatedAt: new Date().toISOString(),
    }, null, 2), 'utf-8');
    console.log('[License] Activated, saved to:', LICENSE_FILE);
  } catch (e) {
    console.error('[License] Save failed:', e);
  }
}

// Load or generate device keys
function loadOrGenerateKeys(): { publicKeyPem: string; privateKeyPem: string; deviceId: string } {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
      
      // Validate keys
      if (data.publicKeyPem && data.privateKeyPem && data.publicKeyPem.includes('-----BEGIN')) {
        // Verify keys are valid by trying to use them
        try {
          crypto.createPublicKey(data.publicKeyPem);
          crypto.createPrivateKey(data.privateKeyPem);
          
          const rawKey = extractRawPublicKey(data.publicKeyPem);
          const deviceId = crypto.createHash('sha256').update(rawKey).digest('hex');
          
          console.log('[OpenClaw] Loaded existing keys, deviceId:', deviceId);
          return { publicKeyPem: data.publicKeyPem, privateKeyPem: data.privateKeyPem, deviceId };
        } catch (e) {
          console.warn('[OpenClaw] Stored keys invalid, regenerating...');
        }
      }
    }
  } catch (e) {
    console.warn('[OpenClaw] Failed to load keys:', e);
  }
  
  // Generate new keys
  const keys = generateNewKeys();
  
  // Save to file
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
    console.log('[OpenClaw] Saved new keys to:', KEYS_FILE);
  } catch (e) {
    console.error('[OpenClaw] Failed to save keys:', e);
  }
  
  return keys;
}

// normalizeDeviceMetadataForAuth - copy from OpenClaw source
function normalizeDeviceMetadataForAuth(value?: string | null): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Lowercase ASCII only
  return trimmed.replace(/[A-Z]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 32)
  );
}

// buildDeviceAuthPayloadV3 - exact copy from OpenClaw device-auth.ts
function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}): string {
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily
  ].join('|');
}

// Sign with Ed25519
function signPayload(payload: string, privateKeyPem: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key);
  return base64UrlEncode(sig);
}

function createWindow() {
  // Initialize device keys
  deviceKeys = loadOrGenerateKeys();
  console.log('[OpenClaw] Device ID:', deviceKeys.deviceId);
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#0a1a12',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    alwaysOnTop: false,
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const devPort = parseInt(process.env.VITE_DEV_PORT || '5174');
    const devUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${devPort}`;
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 如需调试可取消下方注释
  // if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  //   mainWindow.webContents.openDevTools({ mode: 'detach' });
  // }

  mainWindow.webContents.on('did-fail-load', (_e, errCode, errDesc) => {
    console.error('[Electron] 页面加载失败:', errCode, errDesc);
    dialog.showErrorBox('加载失败', `错误代码：${errCode}\n${errDesc}`);
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Electron] 渲染进程崩溃:', details);
    dialog.showErrorBox('渲染进程崩溃', JSON.stringify(details));
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const connected = openclawWs?.readyState === WebSocket.OPEN;
    sendStatus({ connected });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    floatWindow?.close();
    floatWindow = null;
    if (openclawWs) {
      openclawWs.close();
      openclawWs = null;
    }
    if (logWatcher) {
      logWatcher.close();
      logWatcher = null;
    }
    if (logTailProcess) {
      logTailProcess.kill();
      logTailProcess = null;
    }
    if (gatewayProcess && !gatewayProcess.killed) {
      gatewayProcess.kill();
      gatewayProcess = null;
    }
  });
}

function createFloatWindow() {
  if (floatWindow) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const size = 80;
  floatWindow = new BrowserWindow({
    width: size,
    height: size,
    x: sw - size - 20,
    y: sh - size - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  floatWindow.setAlwaysOnTop(true, 'floating');
  floatWindow.loadFile(path.join(__dirname, '..', 'electron', 'float.html'));
  floatWindow.on('closed', () => { floatWindow = null; });
}

ipcMain.on('float-restore', () => {
  if (floatWindow) {
    floatWindow.close();
    floatWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('enter-floating-mode', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  createFloatWindow();
  return { success: true };
});

function generateId(): string {
  return `req-${Date.now()}-${++requestId}`;
}

function connectOpenClaw() {
  if (openclawWs?.readyState === WebSocket.OPEN) return;

  openclawWs = null;
  console.log('[OpenClaw] Connecting to', OPENCLAW_WS_URL, 'retry:', reconnectRetryCount);
  console.log('[OpenClaw] Token loaded:', OPENCLAW_TOKEN ? `${OPENCLAW_TOKEN.slice(0, 8)}...` : 'NONE');
  console.log('[OpenClaw] Device ID:', deviceKeys?.deviceId || 'NOT SET');

  const ws = new WebSocket(OPENCLAW_WS_URL);
  openclawWs = ws;

  ws.on('open', () => {
    console.log('[OpenClaw] WebSocket opened, waiting for challenge...');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (e) {
      console.error('[OpenClaw] Parse error:', e);
    }
  });

  ws.on('close', () => {
    console.log('[OpenClaw] WebSocket disconnected');
    openclawWs = null;
    if (!mainWindow) return;
    reconnectRetryCount++;
    if (reconnectRetryCount <= MAX_RECONNECT_RETRIES) {
      sendStatus({ connected: false, reconnecting: true });
      setTimeout(connectOpenClaw, 5000);
    } else {
      sendStatus({ connected: false, error: '连接失败，请检查Gateway' });
    }
  });

  ws.on('error', (error) => {
    console.error('[OpenClaw] Connection error:', error);
    sendStatus({ connected: false, error: '连接失败: ' + error.message });
  });
}

function sendStatus(status: { connected: boolean; error?: string; model?: string; reconnecting?: boolean }) {
  if (status.connected) reconnectRetryCount = 0;
  console.log('[OpenClaw] Sending status to frontend:', status);
  if (mainWindow) {
    mainWindow.webContents.send('openclaw-status', status);
    console.log('[OpenClaw] Status sent successfully');
  } else {
    console.warn('[OpenClaw] mainWindow is null, cannot send status');
  }
}

function sendMessage(msg: any) {
  mainWindow?.webContents.send('openclaw-message', msg);
}

function floatFlash() {
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.webContents.send('float-flash');
  }
}

function extractTextFromPayload(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  const direct = payload.text ?? payload.delta;
  if (typeof direct === 'string') return direct;
  const msg = payload.message;
  if (msg?.content && Array.isArray(msg.content)) {
    return msg.content
      .filter((b: any) => b?.type === 'text' && b?.text)
      .map((b: any) => String(b.text))
      .join('');
  }
  if (direct?.text) return String(direct.text);
  const raw = payload.content ?? payload.message;
  if (typeof raw === 'string') return raw;
  if (raw?.text) return String(raw.text);
  if (raw?.content) return typeof raw.content === 'string' ? raw.content : extractTextFromPayload(raw.content);
  const blocks = payload.blocks ?? payload.parts ?? payload.chunks;
  if (Array.isArray(blocks)) {
    return blocks.map((b: any) => extractTextFromPayload(b)).filter(Boolean).join('');
  }
  if (payload.body?.text) return String(payload.body.text);
  if (payload.body?.content) return typeof payload.body.content === 'string' ? payload.body.content : '';
  return '';
}

function extractUsage(payload: any): { inputTokens?: number; outputTokens?: number; cost?: number; ctxUsed?: number; ctxMax?: number; session?: string; model?: string } | null {
  if (!payload) return null;
  const usage = payload.usage ?? payload.token_usage;
  const u = usage?.input_tokens ?? usage?.inputTokens ?? usage?.prompt_tokens;
  const o = usage?.output_tokens ?? usage?.outputTokens ?? usage?.completion_tokens;
  const cost = payload.cost ?? payload.total_cost ?? usage?.cost;
  const ctxUsed = payload.ctx_used ?? usage?.context_tokens ?? payload.context_length;
  const ctxMax = ctxUsed !== undefined
    ? (payload.ctx_max ?? payload.max_context_length ?? null)
    : null;
  const session = payload.session ?? payload.session_id ?? payload.sessionId;
  const model = payload.model ?? payload.model_name ?? usage?.model ?? usage?.model_name;
  if (u !== undefined || o !== undefined || cost !== undefined || session !== undefined || model !== undefined || ctxUsed !== undefined) {
    return { inputTokens: u, outputTokens: o, cost, ctxUsed, ctxMax, session, model };
  }
  return null;
}

function forwardChatToFrontend(payload: any, eventName?: string, isStreaming = false) {
  const text = extractTextFromPayload(payload);
  const done = payload?.done ?? (payload?.state === 'done' || payload?.state === 'complete' ? true : isStreaming ? false : true);
  const usage = extractUsage(payload);
  // 斜杠命令的系统回复：payload 直接有 text，无 message.content
  const isSystemReply = !!(payload?.text && typeof payload.text === 'string' && !payload?.message?.content);
  if (text || done !== undefined) {
    const msg: any = { type: 'chat', text: String(text || ''), done: done ?? true, event: eventName };
    if (usage) msg.usage = usage;
    if (isSystemReply) msg.isSystemReply = true;
    sendMessage(msg);
    if (text) floatFlash();
  }
}

function handleMessage(msg: any) {
  console.log('[OpenClaw] Received message:', JSON.stringify(msg).slice(0, 500));
  switch (msg.type) {
    case 'event':
      if (msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce || '';
        console.log('[OpenClaw] Challenge received, nonce:', nonce);
        sendConnectRequest(nonce);
      } else if (msg.event === 'chat' && msg.payload) {
        const isDelta = msg.payload?.state === 'delta';
        forwardChatToFrontend(msg.payload, msg.event, isDelta);
      } else if (msg.event === 'agent' && (msg.data || msg.payload)) {
        const src = msg.data ?? msg.payload;
        const text = src?.delta ?? src?.text ?? extractTextFromPayload(src);
        const isDelta = src?.delta !== undefined;
        const usage = extractUsage(src);
        if (text || src?.done !== undefined) {
          const out: any = { type: 'chat', text: String(text || ''), done: src?.done ?? !isDelta, event: msg.event };
          if (usage) out.usage = usage;
          sendMessage(out);
          if (text) floatFlash();
        }
      } else if (msg.event !== 'connect.challenge' && msg.payload) {
        const text = extractTextFromPayload(msg.payload);
        if (text || msg.payload?.done !== undefined) {
          forwardChatToFrontend(msg.payload, msg.event, msg.payload?.state === 'delta');
        } else {
          sendMessage(msg);
        }
      } else {
        sendMessage(msg);
      }
      break;
      
    case 'res':
      console.log('[OpenClaw] Response: ok=', msg.ok, 'payload=', msg.payload ? JSON.stringify(msg.payload).slice(0, 200) : null);
      if (msg.ok && (msg.payload?.type === 'hello-ok' || msg.method === 'connect')) {
        const model = msg.payload?.model || msg.payload?.agent?.model || undefined;
        console.log('[OpenClaw] Connection successful!');
        sendStatus({ connected: true, model });
      } else if (!msg.ok) {
        console.error('[OpenClaw] Error:', JSON.stringify(msg.error, null, 2));
        sendStatus({ 
          connected: false, 
          error: msg.error?.message || JSON.stringify(msg.error) || 'Connection failed'
        });
      } else if (msg.ok && msg.payload) {
        const text = extractTextFromPayload(msg.payload);
        if (text) forwardChatToFrontend(msg.payload, 'res');
        else sendStatus({ connected: true });
      } else if (msg.ok) {
        console.log('[OpenClaw] Connection successful (no payload)!');
        sendStatus({ connected: true });
      }
      break;
      
    default:
      sendMessage(msg);
  }
}

function sendConnectRequest(nonce: string) {
  if (!deviceKeys) {
    console.error('[OpenClaw] No device keys');
    return;
  }

  console.log('[OpenClaw] Sending connect request...');
  
  const now = Date.now();
  const platform = process.platform; // win32, darwin, linux
  const deviceFamily = undefined;    // official uses undefined -> ''
  
  // Exact match to official client: gateway-client, backend
  const clientId = 'gateway-client';
  const clientMode = 'backend';
  const scopes = ['operator.read', 'operator.write'];
  
  const payload = buildDeviceAuthPayloadV3({
    deviceId: deviceKeys.deviceId,
    clientId,
    clientMode,
    role: 'operator',
    scopes,
    signedAtMs: now,
    token: typeof OPENCLAW_TOKEN === 'string' ? OPENCLAW_TOKEN : '',
    nonce,
    platform,
    deviceFamily
  });
  
  console.log('[OpenClaw] Auth payload:', payload);
  
  const signature = signPayload(payload, deviceKeys.privateKeyPem);
  const publicKeyBase64Url = base64UrlEncode(extractRawPublicKey(deviceKeys.publicKeyPem));
  
  const connectMsg = {
    type: 'req',
    id: generateId(),
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: clientId,
        version: '1.0.0',
        platform,
        mode: clientMode
      },
      role: 'operator',
      scopes,
      caps: [],
      commands: [],
      permissions: {},
      auth: { 
        token: typeof OPENCLAW_TOKEN === 'string' ? OPENCLAW_TOKEN : ''
      },
      locale: 'zh-CN',
      userAgent: 'claw-terminal/1.0.0',
      device: {
        id: deviceKeys.deviceId,
        publicKey: publicKeyBase64Url,
        signature,
        signedAt: now,
        nonce
      }
    }
  };
  
  console.log('[OpenClaw] Sending connect (client.id=%s, client.mode=%s, platform=%s)', clientId, clientMode, platform);
  openclawWs?.send(JSON.stringify(connectMsg));
}

interface UploadedFile {
  path?: string;
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText?: boolean;
  content?: string | null;
  base64?: string;
}

function sendChatMessage(content: string, imageDataUrl?: string | null, files?: UploadedFile[]): { success: boolean; error?: string } {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'WebSocket not connected' };
  }

  const message = typeof content === 'string' ? content : String(content ?? '');
  if (!imageDataUrl && (!files || files.length === 0) && (!message || typeof message !== 'string' || message.trim() === '')) {
    console.warn('[OpenClaw] 消息为空，跳过发送');
    return { success: false, error: '消息不能为空' };
  }

  const reqId = generateId();
  const sessionKey = process.env.OPENCLAW_SESSION_KEY || 'main';
  const idempotencyKey = crypto.randomUUID();

  // OpenClaw chat.send: message 必须是字符串，图片放入 attachments
  const finalMessage = message.trim() || (imageDataUrl || (files && files.length > 0) ? '[文件/图片]' : '');
  const params: { sessionKey: string; idempotencyKey: string; message: string; attachments?: any[] } = {
    sessionKey,
    idempotencyKey,
    message: finalMessage,
  };

  // OpenClaw chat.send attachments: Gateway normalizeRpcAttachmentsToChatAttachments 期望 { type, mimeType, content }
  const attachments: Array<{ type: string; mimeType: string; fileName?: string; content: string }> = [];

  // 1. 粘贴/截图图片 (imageDataUrl)
  if (imageDataUrl) {
    const matches = imageDataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp|bmp));base64,(.+)$/);
    if (matches) {
      const [, mimeType, base64Data] = matches;
      attachments.push({ type: 'image', mimeType: mimeType!, content: base64Data });
    }
  }

  // 2. 附件中的图片转为 base64 后加入（Gateway 仅处理 image/*，非图片暂不传）
  if (files && files.length > 0) {
    for (const f of files) {
      const base64Data = f.base64;
      const mimeType = f.mimeType || 'application/octet-stream';
      if (!base64Data) continue;
      if (mimeType.startsWith('image/')) {
        attachments.push({ type: 'image', mimeType, fileName: f.name, content: base64Data });
      }
    }
  }

  if (attachments.length > 0) params.attachments = attachments;
  const chatMsg = {
    type: 'req',
    id: reqId,
    method: 'chat.send',
    params
  };

  const payloadStr = JSON.stringify(chatMsg);
  console.log('[OCT DEBUG] sending to gateway:', payloadStr.slice(0, 200));
  openclawWs.send(payloadStr);
  return { success: true };
}

// IPC handlers
ipcMain.handle('set-always-on-top', (_, value: boolean) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
    return true;
  }
  return false;
});

ipcMain.handle('get-always-on-top', () => {
  return mainWindow ? mainWindow.isAlwaysOnTop() : false;
});

ipcMain.handle('minimize-window', () => mainWindow?.minimize());

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => mainWindow?.close());

ipcMain.handle('open-image-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return { success: false };
  try {
    const buf = fs.readFileSync(result.filePaths[0]);
    const ext = path.extname(result.filePaths[0]).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' }[ext] || 'image/png';
    return { success: true, base64: buf.toString('base64'), mime };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
});

// 通用文件上传对话框
ipcMain.handle('open-file-dialog', async (_, options?: { allowMultiple?: boolean; filters?: { name: string; extensions: string[] }[] }) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: options?.filters || [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'json', 'csv', 'xls', 'xlsx'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
      { name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
      { name: 'Code', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'html', 'css', 'sql'] },
    ],
    properties: options?.allowMultiple ? ['openFile', 'multiSelections'] : ['openFile']
  });

  if (result.canceled || !result.filePaths.length) return { success: false };

  try {
    const files = await Promise.all(result.filePaths.map(async (filePath) => {
      const stats = fs.statSync(filePath);
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath);

      // 检测 MIME 类型
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.pdf': 'application/pdf',
        '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
        '.csv': 'text/csv',
        '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
        '.mp4': 'video/mp4', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
        '.js': 'text/javascript', '.ts': 'text/typescript', '.jsx': 'text/javascript', '.tsx': 'text/typescript',
        '.py': 'text/x-python', '.java': 'text/x-java', '.cpp': 'text/x-c++', '.c': 'text/x-c',
        '.h': 'text/x-c-header', '.go': 'text/x-go', '.rs': 'text/x-rust',
        '.html': 'text/html', '.css': 'text/css', '.sql': 'text/x-sql',
      };

      const mimeType = mimeMap[ext] || 'application/octet-stream';

      // 判断是否为文本文件（可直接读取内容）
      const textExts = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.html', '.css', '.sql', '.xml', '.yaml', '.yml'];
      const isText = textExts.includes(ext);

      return {
        path: filePath,
        name: fileName,
        size: stats.size,
        ext: ext.slice(1),
        mimeType,
        isText,
        content: isText ? buf.toString('utf-8') : null,
        base64: buf.toString('base64'),
      };
    }));

    return { success: true, files };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('minimize-for-capture', () => {
  if (mainWindow) {
    mainWindow.setOpacity(0);
    mainWindow.setIgnoreMouseEvents(true);
    mainWindow.hide();
  }
  return { success: true };
});

ipcMain.handle('restore-after-capture', () => {
  if (mainWindow) {
    mainWindow.setOpacity(1);
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.show();
    mainWindow.focus();
  }
  return { success: true };
});

let pendingCodeWindowData: { language: string; code: string } | null = null;

ipcMain.handle('open-code-window', (_, payload: { language?: string; code?: string }) => {
  const language = payload?.language || 'text';
  const code = typeof payload?.code === 'string' ? payload.code : '';

  if (codeWindow) {
    codeWindow.close();
    codeWindow = null;
  }

  pendingCodeWindowData = { language, code };
  codeWindow = new BrowserWindow({
    width: 700,
    height: 500,
    minWidth: 400,
    minHeight: 300,
    frame: true,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const codeWinPath = path.join(__dirname, '..', 'electron', 'code-window.html');
  codeWindow.loadFile(codeWinPath);

  codeWindow.on('closed', () => {
    codeWindow = null;
    pendingCodeWindowData = null;
  });

  return { success: true };
});

ipcMain.on('code-window-ready', (e) => {
  if (pendingCodeWindowData && e.sender) {
    e.sender.send('code-window-data', pendingCodeWindowData);
    pendingCodeWindowData = null;
  }
});

ipcMain.on('code-window-close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

// 系统终端窗口 (node-pty + xterm)
function createTerminalWindow() {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.focus();
    return;
  }
  if (terminalPty) {
    try { terminalPty.kill(); } catch (_) {}
    terminalPty = null;
  }

  // 定位到主窗口右侧，避免遮挡聊天区域
  const termW = 700;
  const termH = 400;
  let termX: number | undefined;
  let termY: number | undefined;

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  if (mainWindow && !mainWindow.isDestroyed()) {
    const [mx, my] = mainWindow.getPosition();
    const [mw, mh] = mainWindow.getSize();
    // 主窗口右侧有足够空间则放右侧，否则放左侧
    if (mx + mw + termW + 10 <= sw) {
      termX = mx + mw + 10;
    } else if (mx - termW - 10 >= 0) {
      termX = mx - termW - 10;
    } else {
      termX = Math.max(0, sw - termW - 20);
    }
    // 垂直与主窗口顶部对齐，超出屏幕则靠底
    termY = Math.min(my, sh - termH - 10);
    termY = Math.max(0, termY);
  } else {
    // 没有主窗口时放右下角
    termX = sw - termW - 20;
    termY = sh - termH - 20;
  }

  terminalWindow = new BrowserWindow({
    width: termW,
    height: termH,
    x: termX,
    y: termY,
    minWidth: 400,
    minHeight: 200,
    frame: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const termPath = path.join(__dirname, '..', 'electron', 'terminal-window.html');
  terminalWindow.loadFile(termPath);

  terminalWindow.on('closed', () => {
    if (terminalPty) {
      try { terminalPty.kill(); } catch (_) {}
      terminalPty = null;
    }
    terminalWindow = null;
  });
}

ipcMain.handle('open-terminal-window', () => {
  createTerminalWindow();
  return { success: true };
});

ipcMain.on('terminal-ready', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win !== terminalWindow) return;

  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
  const cwd = process.env.HOME || process.env.USERPROFILE || process.cwd();
  terminalPty = pty.spawn(shell, [], {
    cwd,
    env: process.env as Record<string, string>,
    cols: 80,
    rows: 24,
  });

  terminalPty.onData((data) => {
    if (terminalWindow && !terminalWindow.isDestroyed()) {
      terminalWindow.webContents.send('terminal-data', data);
    }
  });

  terminalPty.onExit(() => {
    terminalPty = null;
  });
});

ipcMain.on('terminal-input', (e, data: string) => {
  if (terminalPty) {
    terminalPty.write(data);
  }
});

ipcMain.on('terminal-close', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.close();
});

ipcMain.on('terminal-set-pin', (e, pinned: boolean) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setAlwaysOnTop(pinned);
});

ipcMain.on('terminal-resize', (e, cols: number, rows: number) => {
  if (terminalPty) {
    terminalPty.resize(cols, rows);
  }
});

function getClawConfigPath() {
  return path.join(app.getPath('userData'), 'claw-config.json');
}

function loadClawConfig(): { screenshotShortcut: string } {
  try {
    const p = getClawConfigPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return { screenshotShortcut: data?.screenshotShortcut || 'Alt+A' };
    }
  } catch {}
  return { screenshotShortcut: 'Alt+A' };
}

function saveClawConfig(config: { screenshotShortcut: string }) {
  try {
    fs.writeFileSync(getClawConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Config] Save failed:', e);
  }
}

function registerScreenshotShortcut(shortcut: string) {
  globalShortcut.unregisterAll();
  if (shortcut && shortcut.trim()) {
    try {
      const ok = globalShortcut.register(shortcut.trim(), () => {
        mainWindow?.webContents.send('screenshot-trigger');
      });
      if (!ok) console.warn('[Config] Failed to register shortcut:', shortcut);
    } catch (e) {
      console.warn('[Config] Register shortcut error:', e);
    }
  }
}

const DEFAULT_LOG_PATH = path.join(os.homedir(), '.openclaw', 'logs', 'gateway.log');

let logTailProcess: ReturnType<typeof spawn> | null = null;
let logWatcher: fs.FSWatcher | null = null;

// 日志噪音过滤
function isNoisyLogLine(line: unknown): boolean {
  if (typeof line !== 'string') return false;
  const noisy = [
    'typing indicator',
    'sending 1 card chunks',
    'sending 2 card chunks',
    'sending 3 card chunks',
    'dispatch complete',
    'card chunks',
  ];
  const lower = line.toLowerCase();
  return noisy.some((n) => lower.includes(n));
}

// 解析 gateway.log 的 JSONL 行，格式化为 [HH:MM:SS] [LEVEL] 消息
function formatGatewayLogLine(rawLine: string): string | null {
  try {
    const obj = JSON.parse(rawLine) as Record<string, unknown>;
    const time = (obj?.time as string) || '';
    const meta = obj?._meta as Record<string, string> | undefined;
    const level = ((meta?.logLevelName ?? obj?.level ?? 'INFO') as string).toUpperCase();
    let msg = obj?.['1'] ?? obj?.msg ?? obj?.message ?? '';
    if (msg && typeof msg !== 'string') msg = JSON.stringify(msg);
    msg = String(msg || '');
    let hhmmss = '--:--:--';
    if (time) {
      const d = new Date(time);
      if (!isNaN(d.getTime())) {
        hhmmss = d.toTimeString().slice(0, 8);
      }
    }
    return `[${hhmmss}] [${level}] ${msg}`.trim();
  } catch {
    return null;
  }
}

function readLogTail(filePath: string): { success: boolean; content?: string; lines?: string[]; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    return { success: true, content, lines };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

ipcMain.handle('read-log-file', async (_, logPath: string) => {
  const pathToUse = logPath || process.env.OPENCLAW_LOG_PATH || DEFAULT_LOG_PATH;
  return readLogTail(pathToUse);
});

ipcMain.handle('start-log-watch', async (_, logPath: string) => {
  const pathToUse = logPath || process.env.OPENCLAW_LOG_PATH || DEFAULT_LOG_PATH;
  console.log('[LOG] Starting log watch for:', pathToUse);

  // 停止旧的监听
  if (logTailProcess) {
    logTailProcess.kill();
    logTailProcess = null;
  }
  if (logWatcher) {
    logWatcher.close();
    logWatcher = null;
  }

  if (!fs.existsSync(pathToUse)) {
    console.log('[LOG] File does not exist:', pathToUse);
    mainWindow?.webContents.send('openclaw-log-lines', [
      '[LOG] 日志文件不存在，且 Gateway 不是由 CLAW TERMINAL 启动。',
      '[LOG] 请点击 [▶ 启动] 以获取实时日志。',
    ]);
    return { success: false, error: 'Log file not found' };
  }

  try {
    const seenRaw = new Set<string>();
    // 先读取最新20行，用原始行去重，避免 tail 输出时重复
    const content = fs.readFileSync(pathToUse, 'utf-8');
    const allLines = content.split('\n').filter((l) => l.trim());
    const formatted: string[] = [];
    for (const raw of allLines.slice(-20)) {
      const r = raw.trim();
      if (seenRaw.has(r)) continue;
      seenRaw.add(r);
      const msg = (() => { try { const o = JSON.parse(raw); return o?.['1'] ?? o?.message ?? ''; } catch { return raw; } })();
      if (isNoisyLogLine(msg)) continue;
      const out = formatGatewayLogLine(raw);
      if (out) formatted.push(out);
    }
    if (formatted.length > 0) {
      mainWindow?.webContents.send('openclaw-log-lines', formatted);
    } else {
      mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 等待Gateway日志...']);
    }
    // 根据平台使用不同的日志监控方式
    if (process.platform === 'win32') {
      // Windows: 使用 PowerShell
      const psPath = pathToUse.replace(/'/g, "''");
      const psCmd = `$p='${psPath}'; while($true){if(Test-Path -LiteralPath $p){Get-Content -LiteralPath $p -Tail 10 -Encoding UTF8}; Start-Sleep -Milliseconds 500}`;
      
      try {
        const { execSync } = require('child_process');
        execSync('where powershell.exe', { stdio: 'ignore', windowsHide: true });
        logTailProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (e) {
        console.warn('[Main] PowerShell not found, using fallback log watcher');
        mainWindow?.webContents.send('openclaw-log-lines', ['[WARN] PowerShell 未找到，使用备用日志监控']);
        // 备用方案：fs.watch
        try {
          const fsWatcher = fs.watch(pathToUse, { persistent: false }, (eventType) => {
            if (eventType === 'change' && fs.existsSync(pathToUse)) {
              try {
                const content = fs.readFileSync(pathToUse, 'utf-8');
                const lines = content.split('\n').slice(-10);
                lines.forEach(line => {
                  if (line.trim()) mainWindow?.webContents.send('openclaw-log-lines', [line]);
                });
              } catch (e) {}
            }
          });
          (global as any).logFsWatcher = fsWatcher;
        } catch (e2) {
          console.error('[Main] Fallback log watcher failed:', e2);
        }
      }
    } else {
      // Mac/Linux: 使用 tail -f
      logTailProcess = spawn('tail', ['-f', pathToUse], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    }
    if (logTailProcess) {
      let buf = '';
      logTailProcess.stdout?.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        for (const raw of lines) {
          const t = raw.trim();
          if (!t || seenRaw.has(t)) continue;
          seenRaw.add(t);
          const msg = (() => { try { const o = JSON.parse(t); return o?.['1'] ?? o?.message ?? ''; } catch { return t; } })();
          if (isNoisyLogLine(msg)) continue;
          const out = formatGatewayLogLine(t);
          if (!out) continue;
          mainWindow?.webContents.send('openclaw-log-lines', [out]);
        }
      });

      logTailProcess.stderr?.on('data', (chunk: Buffer) => {
        const msg = chunk.toString('utf8').trim();
        if (msg) mainWindow?.webContents.send('openclaw-log-lines', [`[ERR] ${msg}`]);
      });

      logTailProcess.on('exit', (code) => {
        logTailProcess = null;
        if (code !== 0 && code !== null) {
          mainWindow?.webContents.send('openclaw-log-lines', [`[LOG] tail 进程退出: ${code}`]);
        }
      });
    }

    mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 正在监听日志...']);
    return { success: true };
  } catch (e) {
    console.log('[LOG] Exception:', e);
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('stop-log-watch', () => {
  if (logTailProcess) {
    logTailProcess.kill();
    logTailProcess = null;
  }
  if (logWatcher) {
    logWatcher.close();
    logWatcher = null;
  }
  return { success: true };
});

// ===== Gateway 进程管理 =====

function sendGatewayLogLine(line: string) {
  if (!line.trim() || isNoisyLogLine(line)) return;
  mainWindow?.webContents.send('openclaw-log-lines', [line.trim()]);
}

async function startGatewayProcess(): Promise<{ success: boolean; error?: string; alreadyRunning?: boolean; portInUse?: boolean }> {
  if (gatewayProcess && !gatewayProcess.killed) {
    return { success: true, alreadyRunning: true };
  }
  const inUse = await isPortInUse(GATEWAY_PORT);
  if (inUse) {
    return { success: false, portInUse: true, error: 'Gateway 已在运行，端口 18789 已被占用' };
  }

  // 初始化用户数据目录
  initOpenClawUserData();

  // 优先使用内嵌 OpenClaw
  const embeddedEntry = getEmbeddedOpenClawEntry();
  if (embeddedEntry) {
    console.log('[Gateway] Using embedded OpenClaw:', embeddedEntry);
    try {
      const nodeBin = process.execPath; // Electron 内置 Node.js
      const workDir = getOpenClawWorkDir();
      gatewayProcess = spawn(nodeBin, [embeddedEntry, 'gateway', '--port', String(GATEWAY_PORT)], {
        cwd: workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: false,
        env: {
          ...process.env,
          OPENCLAW_GATEWAY_PORT: String(GATEWAY_PORT),
          ELECTRON_RUN_AS_NODE: '1',
        },
      });
      gatewayManagedByUs = true;
      console.log('[Gateway] Started (embedded) PID:', gatewayProcess.pid);
      mainWindow?.webContents.send('gateway-status', { running: true, managed: true, pid: gatewayProcess.pid });

      let stdoutBuf = '';
      gatewayProcess.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8');
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() ?? '';
        lines.forEach(sendGatewayLogLine);
      });
      gatewayProcess.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        text.split(/\r?\n/).forEach((l) => { if (l.trim()) sendGatewayLogLine(`[ERR] ${l.trim()}`); });
      });
      gatewayProcess.on('error', (err) => {
        console.error('[Gateway] Process error:', err);
        mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway ERROR] ${err.message}`]);
      });
      gatewayProcess.on('exit', (code, signal) => {
        console.log('[Gateway] Exited, code:', code, 'signal:', signal);
        gatewayProcess = null;
        gatewayManagedByUs = false;
        mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
        mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway] 进程已退出 (code: ${code ?? signal})`]);
      });
      return { success: true };
    } catch (e: any) {
      console.warn('[Gateway] Embedded start failed, fallback to system gateway:', e?.message);
    }
  }

  // 回退：使用系统安装的 gateway.cmd（向下兼容）
  if (!fs.existsSync(GATEWAY_CMD)) {
    return { success: false, error: `Gateway 未找到: ${GATEWAY_CMD}` };
  }
  try {
    gatewayProcess = spawn('cmd', ['/c', GATEWAY_CMD], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });
    gatewayManagedByUs = true;
    console.log('[Gateway] Started PID:', gatewayProcess.pid);
    mainWindow?.webContents.send('gateway-status', { running: true, managed: true, pid: gatewayProcess.pid });

    let stdoutBuf = '';
    gatewayProcess.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split(/\r?\n/);
      stdoutBuf = lines.pop() ?? '';
      lines.forEach(sendGatewayLogLine);
    });

    gatewayProcess.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((l) => {
        if (l.trim()) sendGatewayLogLine(`[ERR] ${l.trim()}`);
      });
    });

    gatewayProcess.on('error', (err) => {
      console.error('[Gateway] Process error:', err);
      mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway ERROR] ${err.message}`]);
    });

    gatewayProcess.on('exit', (code, signal) => {
      console.log('[Gateway] Exited, code:', code, 'signal:', signal);
      gatewayProcess = null;
      gatewayManagedByUs = false;
      mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
      mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway] 进程已退出 (code: ${code ?? signal})`]);
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

ipcMain.handle('start-gateway', async () => {
  const result = await startGatewayProcess();
  if (result.alreadyRunning) {
    mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 进程已在运行（由本程序管理）']);
  } else if (result.portInUse) {
    mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 检测到外部 Gateway，已连接']);
    return { success: true, portInUse: true };
  } else if (!result.success) {
    mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway] 启动失败: ${result.error}`]);
  } else {
    mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 正在启动...']);
  }
  return result;
});

ipcMain.handle('stop-gateway', () => {
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
    gatewayProcess = null;
    gatewayManagedByUs = false;
    mainWindow?.webContents.send('gateway-status', { running: false, managed: false });
    mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 已停止']);
    return { success: true };
  }
  return { success: false, error: 'Gateway 未在运行' };
});

ipcMain.handle('gateway-restart', async () => {
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill();
    gatewayProcess = null;
    gatewayManagedByUs = false;
  }
  mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 正在重启...']);
  const result = await startGatewayProcess();
  if (result.success || result.portInUse) {
    mainWindow?.webContents.send('openclaw-log-lines', [result.portInUse ? '[Gateway] 外部进程已占用端口，已连接' : '[Gateway] 已启动']);
    return { success: true };
  }
  mainWindow?.webContents.send('openclaw-log-lines', [`[Gateway] 重启失败: ${result.error}`]);
  return { success: false, error: result.error };
});

ipcMain.handle('kill-port-18789', async () => {
  const { execSync } = await import('child_process');
  try {
    const port = 18789;
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', windowsHide: true });
    const lines = out.trim().split(/\r?\n/);
    for (const line of lines) {
      const m = line.trim().match(/\s+(\d+)\s*$/);
      if (m) {
        const pid = parseInt(m[1], 10);
        if (pid > 0) {
          execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8', windowsHide: true });
          mainWindow?.webContents.send('openclaw-log-lines', [`[System] 已终止 PID ${pid} (端口 ${port})`]);
          return { success: true };
        }
      }
    }
    mainWindow?.webContents.send('openclaw-log-lines', [`[System] 端口 ${port} 无占用进程`]);
    return { success: true };
  } catch (e: any) {
    mainWindow?.webContents.send('openclaw-log-lines', [`[System] 清理失败: ${e?.message || String(e)}`]);
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('gateway-status', async () => {
  const portInUse = await isPortInUse(GATEWAY_PORT);
  return {
    running: !!gatewayProcess && !gatewayProcess.killed,
    managed: gatewayManagedByUs,
    pid: gatewayProcess?.pid,
    portInUse,
  };
});

ipcMain.handle('get-env', (_, key: string) => process.env[key] || '');

// License 授权
ipcMain.handle('license-check', () => isLicenseActivated());
ipcMain.handle('license-verify', (_, code: string) => {
  const result = verifyLicenseCode(code);
  if (result.valid) saveLicenseActivated();
  return result;
});

// API Key 配置管理：优先从 userData/config.json 读取 OPENCLAW_*（打包后 .env 不存在）
ipcMain.handle('get-api-keys', async () => {
  try {
    const envFilePath = path.join(__dirname, '..', '.env');
    const keys: Record<string, string> = {};
    if (fs.existsSync(envFilePath)) {
      const envContent = fs.readFileSync(envFilePath, 'utf-8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key) keys[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      keys.OPENCLAW_WS_URL = cfg.OPENCLAW_WS_URL ?? keys.OPENCLAW_WS_URL ?? 'ws://127.0.0.1:18789';
      keys.OPENCLAW_TOKEN = cfg.OPENCLAW_TOKEN ?? keys.OPENCLAW_TOKEN ?? '';
    }
    return { 
      success: true, 
      data: { 
        DASHSCOPE_API_KEY: keys.DASHSCOPE_API_KEY || '', 
        DEEPSEEK_API_KEY: keys.DEEPSEEK_API_KEY || '',
        OPENCLAW_WS_URL: keys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
        OPENCLAW_TOKEN: keys.OPENCLAW_TOKEN || ''
      } 
    };
  } catch (e: any) {
    console.error('[API Keys] Failed to read:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('save-api-keys', async (_, keys: { DASHSCOPE_API_KEY?: string; DEEPSEEK_API_KEY?: string; OPENCLAW_WS_URL?: string; OPENCLAW_TOKEN?: string }) => {
  try {
    const envFilePath = path.join(__dirname, '..', '.env');
    if (!app.isPackaged) {
      let envContent = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf-8') : `# OCT | OpenClaw Terminal 环境配置

# ===== 阿里云百炼 API（主要使用）=====
DASHSCOPE_API_KEY=your_dashscope_api_key_here

# ===== DeepSeek API（备选）=====
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# OpenClaw WebSocket 地址
OPENCLAW_WS_URL=ws://127.0.0.1:18789

# OpenClaw WebSocket Token 认证
OPENCLAW_TOKEN=your_openclaw_token_here

# Eagle API 地址
EAGLE_API_URL=http://localhost:41595

# Vite 开发服务器端口
VITE_DEV_PORT=5174

# OpenClaw 日志路径
OPENCLAW_LOG_PATH=
`;
      const lines = envContent.split('\n');
      const updatedKeys = new Set<string>();
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key] = trimmed.split('=');
          if (key && keys.hasOwnProperty(key.trim())) {
            const value = keys[key.trim() as keyof typeof keys] || '';
            lines[i] = `${key.trim()}=${value}`;
            updatedKeys.add(key.trim());
          }
        }
      }
      for (const [key, value] of Object.entries(keys)) {
        if (!updatedKeys.has(key)) lines.push(`${key}=${value || ''}`);
      }
      fs.writeFileSync(envFilePath, lines.join('\n'), 'utf-8');
      dotenv.config({ path: envFilePath, override: true });
    }
    
    // 同时写入 userData/config.json（打包后 .env 不存在，以此为准）
    ensureConfigFile();
    let cfg: Record<string, string> = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {}
    }
    if (keys.OPENCLAW_WS_URL !== undefined) cfg.OPENCLAW_WS_URL = keys.OPENCLAW_WS_URL || '';
    if (keys.OPENCLAW_TOKEN !== undefined) cfg.OPENCLAW_TOKEN = keys.OPENCLAW_TOKEN || '';
    Object.assign(cfg, {
      OPENCLAW_WS_URL: cfg.OPENCLAW_WS_URL ?? DEFAULT_CONFIG.OPENCLAW_WS_URL,
      OPENCLAW_TOKEN: cfg.OPENCLAW_TOKEN ?? '',
    });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
    console.log('[API Keys] Saved to .env and config.json');
    
    loadOpenClawConfig();
    if (openclawWs) {
      openclawWs.close();
      openclawWs = null;
    }
    connectOpenClaw();
    
    return { success: true };
  } catch (e: any) {
    console.error('[API Keys] Failed to save:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('test-log-write', () => {
  const testPath = path.join(os.homedir(), '.openclaw', 'logs', 'commands.log');
  const dir = path.dirname(testPath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const testLine = `{"timestamp":"${new Date().toISOString()}","level":"INFO","message":"Test log entry from CLAW Terminal","source":"test"}\n`;
    fs.appendFileSync(testPath, testLine, 'utf8');
    console.log('[LOG] Test line written to:', testPath);
    return { success: true };
  } catch (e: any) {
    console.log('[LOG] Failed to write test line:', e.message);
    return { success: false, error: e.message };
  }
});

const CHAT_HISTORY_PATH = path.join(os.homedir(), '.openclaw', 'claw-terminal-history.json');
const MAX_HISTORY = 100;

ipcMain.handle('chat-history-load', async () => {
  try {
    const raw = fs.readFileSync(CHAT_HISTORY_PATH, 'utf-8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
});

ipcMain.handle('chat-history-save', async (_: any, items: Array<{ role: string; content: string; timestamp: string; isSystemReply?: boolean }>) => {
  try {
    const dir = path.dirname(CHAT_HISTORY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const toSave = (items || []).slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp || '',
      ...(m.isSystemReply && { isSystemReply: true }),
    }));
    fs.writeFileSync(CHAT_HISTORY_PATH, JSON.stringify(toSave, null, 0), 'utf-8');
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('openclaw-connect', () => {
  connectOpenClaw();
  return { success: true };
});

ipcMain.handle('openclaw-send', (_, payload: string | { content: string; imageDataUrl?: string | null; files?: UploadedFile[] }) => {
  let content: string;
  let imageDataUrl: string | null | undefined;
  let files: UploadedFile[] | undefined;
  
  if (typeof payload === 'string') {
    content = payload;
    imageDataUrl = null;
    files = undefined;
  } else if (payload && typeof payload === 'object') {
    const c = payload.content;
    content = typeof c === 'string' ? c : (c ? String(c) : '');
    imageDataUrl = payload.imageDataUrl;
    files = payload.files;
  } else {
    content = '';
    imageDataUrl = null;
    files = undefined;
  }
  
  return sendChatMessage(content, imageDataUrl, files);
});

ipcMain.handle('openclaw-status', () => {
  const sessionKey = process.env.OPENCLAW_SESSION_KEY || 'main';
  return { connected: openclawWs?.readyState === WebSocket.OPEN, sessionKey };
});

ipcMain.handle('show-notification', (_, { title, body }: { title: string; body: string }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.handle('tts-speak', async (_, { text }: { text: string }) => {
  const apiKey = (process.env.DASHSCOPE_API_KEY || '').trim();
  if (!apiKey) {
    return { success: false, error: 'DASHSCOPE_API_KEY not configured' };
  }
  try {
    const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'cosyvoice-v1',
        voice: 'longxiaochun',
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `TTS API error ${res.status}: ${errText}` };
    }
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    return { success: true, audioBase64: base64 };
  } catch (e: any) {
    return { success: false, error: e?.message || 'TTS request failed' };
  }
});

app.whenReady().then(async () => {
  loadOpenClawConfig();
  createWindow();

  // 先尝试启动 Gateway（如果端口未被占用）
  const inUse = await isPortInUse(GATEWAY_PORT);
  if (!inUse) {
    console.log('[Gateway] Port not in use, starting Gateway...');
    const result = await startGatewayProcess();
    if (result.success) {
      // 等待 Gateway 启动完成，轮询端口
      let ready = false;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isPortInUse(GATEWAY_PORT)) {
          ready = true;
          break;
        }
      }
      if (ready) {
        console.log('[Gateway] Ready on port', GATEWAY_PORT);
        mainWindow?.webContents.send('openclaw-log-lines', ['[Gateway] 已启动']);
      } else {
        console.warn('[Gateway] Failed to start, port not responding');
        mainWindow?.webContents.send('openclaw-log-lines', ['[ERR] Gateway 启动超时']);
      }
    } else {
      mainWindow?.webContents.send('openclaw-log-lines', [`[ERR] Gateway 启动失败: ${result.error}`]);
    }
  } else {
    console.log('[Gateway] Port already in use, external Gateway detected');
    mainWindow?.webContents.send('openclaw-log-lines', ['[LOG] 检测到外部 Gateway，尝试连接...']);
  }

  connectOpenClaw();

  const config = loadClawConfig();
  registerScreenshotShortcut(config.screenshotShortcut);
});

ipcMain.handle('get-screenshot-shortcut', () => {
  return loadClawConfig().screenshotShortcut;
});

ipcMain.handle('set-screenshot-shortcut', (_, shortcut: string) => {
  const s = typeof shortcut === 'string' ? shortcut.trim() : 'Alt+A';
  saveClawConfig({ screenshotShortcut: s });
  registerScreenshotShortcut(s);
  return { success: true };
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});