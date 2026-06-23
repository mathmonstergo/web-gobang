import { type GobangRoom } from "./room-object";

export type WorkerEnv = {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<GobangRoom>;
};

export type JsonResponseInit = ResponseInit & {
  status?: number;
};
