import "reflect-metadata";
import Koa from "koa";
import cors from "@koa/cors";
import bodyParser from "koa-bodyparser";
import Router from "@koa/router";
import session from "koa-session";
import redisStore from "koa-redis";
import { PORT, SESSION_NAME } from "./constants";
import redis from "./redis";
import { buildSchema } from "type-graphql";
import path from "path";
import { Context } from "./types";
import { ApolloServer } from "apollo-server-koa";
import { logger } from "@gql-learning/utils";
import { MikroORM } from "@mikro-orm/core";
import { MongoDriver } from "@mikro-orm/mongodb";
import { User } from "./entities/UserEntity";
import { PasswordReset } from "./entities/PasswordResetEntity";
import { CustomAuthChecker } from "./utils/AuthChecker";

const app = new Koa();
const router = new Router();

app.use(
    cors({
        credentials: true,
    }),
);

app.keys = ["Some key here ignore"];

const SESSION_CONFIG = {
    key: SESSION_NAME,
    maxAge: 86400000 * 14,
    autoCommit: true,
    overwrite: true,
    httpOnly: true,
    signed: true,
    rolling: true,
    renew: false,
    store: redisStore({
        client: redis,
    }),
};

app.use(session(SESSION_CONFIG, app));
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

async function main() {
    const orm = await MikroORM.init<MongoDriver>();
    const em = orm.em;

    await em.getDriver().ensureIndexes();

    const schema = await buildSchema({
        resolvers: [__dirname + "/resolvers/**/*.{ts,js}"],
        emitSchemaFile: path.resolve(__dirname, "schema.gql"),
        authChecker: CustomAuthChecker,
    });

    const server = new ApolloServer({
        debug: true,
        schema,
        context: (context): Context => {
            return {
                ...context,
                redis,
                userRepository: em.getRepository(User),
                passwordResetRepository: em.getRepository(PasswordReset),
            };
        },
    });

    server.applyMiddleware({ app, path: "/api/graphql" });

    app.listen(PORT, () => {
        logger.info(`Koa server listening on port ${PORT}`);
    });
}

main().catch(err => console.error(err));
