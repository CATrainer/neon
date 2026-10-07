import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { newId } from '@neon/core'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { secrets } from '../db/schema.js'

/**
 * Encrypted at rest, AES-256-GCM, with the key held only in the environment.
 *
 * This exists before there is anything to put in it. That is deliberate: the
 * first GitHub token must land in a store that already encrypts, rather than in
 * a column somebody promises to encrypt later.
 */
export class SecretStore {
  private readonly key: Buffer

  constructor(
    private readonly db: Db,
    keyBase64: string,
  ) {
    if (!keyBase64) {
      throw new Error(
        'NEON_SECRET_KEY is not set. Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      )
    }
    this.key = Buffer.from(keyBase64, 'base64')
    if (this.key.length !== 32) {
      throw new Error(`NEON_SECRET_KEY must decode to 32 bytes, got ${this.key.length}`)
    }
  }

  async put(scope: string, name: string, plaintext: string): Promise<void> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const values = {
      id: newId(),
      scope,
      name,
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    }
    await this.db
      .insert(secrets)
      .values(values)
      .onConflictDoUpdate({
        target: [secrets.scope, secrets.name],
        set: { ciphertext: values.ciphertext, iv: values.iv, authTag: values.authTag },
      })
  }

  async get(scope: string, name: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(secrets)
      .where(and(eq(secrets.scope, scope), eq(secrets.name, name)))
      .limit(1)
    if (!row) return null

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(row.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(row.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }
}
