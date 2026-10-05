import { writeFile } from 'node:fs/promises';
import {
  buildClientSchema,
  getIntrospectionQuery,
  lexicographicSortSchema,
  printSchema,
} from 'graphql';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
const schemas = [];
for (const [service, fallback] of [
  ['auth', 'http://localhost:3000/graphql'],
  ['social', 'http://localhost:3001/graphql'],
]) {
  const url =
    process.env[`NEXT_PUBLIC_${service.toUpperCase()}_GRAPHQL_URL`] ?? fallback;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || result.errors || !result.data) {
    throw new Error(
      `Cannot introspect ${service}: check the running development API at ${url}.`,
    );
  }
  schemas.push([
    service,
    printSchema(lexicographicSortSchema(buildClientSchema(result.data))),
  ]);
}
// Fetch both successfully before replacing either committed snapshot.
for (const [service, schema] of schemas) {
  await writeFile(`graphql/${service}.schema.graphql`, `${schema}\n`);
  console.log(`Updated ${service} schema snapshot.`);
}
