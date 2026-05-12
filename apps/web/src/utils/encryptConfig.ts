/**
 * 配置加密工具
 * 使用 Web Crypto API 的 AES-GCM + PBKDF2 对敏感字段（密码、token）进行加密存储
 * 密钥派生自应用固定盐值，无需用户记忆额外密码
 *
 * ⚠️ 这不是军用级加密，而是防止明文泄露的安全防护
 * 数据在应用运行时仍然需要解密后使用，安全性等价于在 localStroage 中明文存储
 * 目的是防止 config.json 或导出的配置文件中直接暴露密码/token
 */

const ALGORITHM = `AES-GCM`
const KEY_LENGTH = 256
const ITERATIONS = 100000
const SALT = new TextEncoder().encode(`md-webdav-config-encryption-v1`)
const APP_KEY = `hermes-app-config-key`

/** 敏感字段的 key 列表 */
const SENSITIVE_KEYS = new Set([
  // 图床
  `token`, `accessToken`, `access_token`,
  `secretKey`, `secret`, `secret_id`, `secret_key`,
  `password`, `passwd`,
  `apiKey`, `api_key`, `apiSecret`, `api_secret`,
  `privateKey`, `private_key`,
  // WebDAV
  `username`, `password`,
  // Telegram
  `botToken`, `bot_token`,
])

/** 存储本地派生密钥（避免每次加密都重新派生） */
let cachedKey: CryptoKey | null = null

async function deriveKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey

  const keyMaterial = await crypto.subtle.importKey(
    `raw`,
    new TextEncoder().encode(APP_KEY),
    { name: `PBKDF2` },
    false,
    [`deriveKey`],
  )

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: `PBKDF2`,
      salt: SALT,
      iterations: ITERATIONS,
      hash: `SHA-256`,
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    [`encrypt`, `decrypt`],
  )

  return cachedKey
}

/**
 * 加密明文
 * @returns base64 编码的密文，格式为 "base64_iv:base64_ciphertext"
 */
export async function encryptText(plaintext: string): Promise<string> {
  const key = await deriveKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  )

  const ivBase64 = btoa(String.fromCharCode(...iv))
  const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))

  return `${ivBase64}:${ctBase64}`
}

/**
 * 解密密文
 * @param encrypted - base64 格式的密文 "base64_iv:base64_ciphertext"
 * @returns 明文，解密失败返回 null
 */
export async function decryptText(encrypted: string): Promise<string | null> {
  try {
    const key = await deriveKey()
    const parts = encrypted.split(`:`)
    if (parts.length !== 2) return null

    const iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0))
    const ciphertext = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0))

    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext,
    )

    return new TextDecoder().decode(plaintext)
  }
  catch {
    return null
  }
}

/**
 * 检查字符串是否为加密格式
 */
export function isEncrypted(str: string): boolean {
  return /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(str)
}

/**
 * 判断字段名是否为敏感字段
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key)
}

/**
 * 深度遍历对象，加密所有敏感字段的值
 * 递归处理嵌套对象
 */
export async function encryptSensitiveFields(obj: Record<string, any>): Promise<Record<string, any>> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result[key] = value
      continue
    }

    if (typeof value === `string` && isSensitiveKey(key) && !isEncrypted(value)) {
      result[key] = await encryptText(value)
    }
    else if (typeof value === `object` && !Array.isArray(value)) {
      result[key] = await encryptSensitiveFields(value)
    }
    else {
      result[key] = value
    }
  }

  return result
}

/**
 * 深度遍历对象，解密所有加密格式的字段值
 */
export async function decryptSensitiveFields(obj: Record<string, any>): Promise<Record<string, any>> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === `string` && isEncrypted(value)) {
      const decrypted = await decryptText(value)
      result[key] = decrypted ?? value
    }
    else if (typeof value === `object` && !Array.isArray(value) && value !== null) {
      result[key] = await decryptSensitiveFields(value)
    }
    else {
      result[key] = value
    }
  }

  return result
}
