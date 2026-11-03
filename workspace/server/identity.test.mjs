import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityVerifier } from './identity.mjs';

test('identity requires a remotely verified bearer session', async () => {
  assert.throws(() => createIdentityVerifier(), /not configured/);
  const verify = createIdentityVerifier({client:{auth:{getUser:async (token) => token === 'valid' ? {data:{user:{id:'user-1'}},error:null} : {data:{user:null},error:{message:'invalid'}}}}});
  await assert.rejects(verify(undefined), /Authentication required/);
  await assert.rejects(verify('Bearer forged'), /Invalid session/);
  assert.deepEqual(await verify('Bearer valid'), {userId:'user-1'});
  const offline = createIdentityVerifier({client:{auth:{getUser:async()=>{throw new Error('network')}}}});
  await assert.rejects(offline('Bearer valid'), /verification unavailable/);
});
