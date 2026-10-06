import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './platform/sentry-options';

Sentry.init(sentryOptions());
