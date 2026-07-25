import { actions, middleware, pages, i18n } from "astro/hono";
import { Hono } from "hono";
import { logger } from "hono/logger";

const app = new Hono();

// Hono middleware
app.use(logger());

// Astro handlers (as Hono middleware)
app.use(actions());
app.use(middleware());
app.use(pages());
app.use(i18n());

export default app;
