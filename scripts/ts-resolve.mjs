// Lets `node --experimental-strip-types` resolve the extensionless relative
// imports used by the Next.js (bundler-resolution) engine sources.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]s$/.test(specifier)) {
      return next(specifier + '.ts', context);
    }
    throw error;
  }
}
`));
