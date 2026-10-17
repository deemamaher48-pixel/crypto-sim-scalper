import { createServerFn } from "@tanstack/react-start";
import { fetchNewsTimes } from "@/lib/news-guard";

export const getNewsTimes = createServerFn({ method: "GET" }).handler(async () => fetchNewsTimes());
