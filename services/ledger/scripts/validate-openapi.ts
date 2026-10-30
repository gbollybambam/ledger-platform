import SwaggerParser from '@apidevtools/swagger-parser';

const file = process.argv[2] ?? 'openapi/ledger.v1.yaml';
try {
  await SwaggerParser.validate(file);
  process.stdout.write(`${file} is a valid OpenAPI document\n`);
} catch (err) {
  process.stderr.write(
    `${file} is not valid:\n${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
}
