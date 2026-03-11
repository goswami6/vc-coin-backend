const fetch = globalThis.fetch;

(async () => {
  try {
    const res = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User 2',
        email: 'test2@example.com',
        mobile: '1234567891',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    });

    const data = await res.text();
    console.log('status', res.status);
    console.log('body', data);
  } catch (err) {
    console.error('fetch error', err);
  }
})();
