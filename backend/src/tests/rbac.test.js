import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';

async function request(path, options = {}) {
  const server = app.listen(0);
  const { port } = await new Promise((resolve) => server.once('listening', () => resolve(server.address())));

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('Requests without a Supabase session cannot authenticate', async () => {
  const { response, body } = await request('/api/timetable/generate', {
    method: 'POST',
  });

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('Requests without a Supabase session cannot authorize user management', async () => {
  const { response, body } = await request('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'new@schedulix.app', name: 'New User', role: 'VIEWER' }),
  });

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('Requests without a Supabase session cannot create users', async () => {
  const { response, body } = await request('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'new@schedulix.app', name: 'New User', role: 'VIEWER' }),
  });

  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});
