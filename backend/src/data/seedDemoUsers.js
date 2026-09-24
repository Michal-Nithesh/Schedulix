import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

const demoUsers = [
  {
    key: 'ADMIN',
    displayName: 'Administrator',
    role: 'ADMINISTRATOR',
    fallbackEmail: 'admin@timetable.demo',
    fallbackPassword: 'Admin@12345',
  },
  {
    key: 'SCHEDULER',
    displayName: 'Scheduler',
    role: 'SCHEDULER',
    fallbackEmail: 'scheduler@timetable.demo',
    fallbackPassword: 'Scheduler@12345',
  },
  {
    key: 'VIEWER',
    displayName: 'Viewer',
    role: 'VIEWER',
    fallbackEmail: 'viewer@timetable.demo',
    fallbackPassword: 'Viewer@12345',
  },
];

function getCredentials(user) {
  return {
    email: process.env[`DEMO_${user.key}_EMAIL`] || user.fallbackEmail,
    password: process.env[`DEMO_${user.key}_PASSWORD`] || user.fallbackPassword,
  };
}

async function seedUser(client, definition) {
  const credentials = getCredentials(definition);
  const { data: listed, error: listError } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;

  let user = listed.users.find((candidate) => candidate.email?.toLowerCase() === credentials.email.toLowerCase());
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email: credentials.email,
      password: credentials.password,
      email_confirm: true,
      user_metadata: { display_name: definition.displayName },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await client.auth.admin.updateUserById(user.id, {
      password: credentials.password,
      email_confirm: true,
      user_metadata: { ...user.user_metadata, display_name: definition.displayName },
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await client.from('app_users').upsert({
    id: user.id,
    display_name: definition.displayName,
    role: definition.role,
  });
  if (profileError) throw profileError;

  console.log(`${definition.displayName}: ${credentials.email} (${definition.role})`);
}

if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding demo users.');
}

const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const definition of demoUsers) {
  await seedUser(client, definition);
}
