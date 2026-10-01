import { type AxiosError } from "axios";

export const parsePlatformError = (err: unknown, genericError?: string) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const serverError = (err as AxiosError).response?.data?.message;

  return (
    serverError || genericError || "Something went wrong. Plesae try again."
  );
};
