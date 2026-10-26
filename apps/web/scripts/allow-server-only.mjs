import { register } from 'node:module';

// Scripts run outside the framework, where the `server-only` guard has nothing to protect.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true };
        return nextResolve(specifier, context);
      }
    `),
  import.meta.url,
);
