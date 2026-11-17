// Minimal stand-ins for the Talizen types these pages were written against.
export type Metadata = Record<string, unknown>
export type GetServerSidePropsContext<P = Record<string, string>> = { params: P; query: Record<string, string> }
export type GetServerSidePropsResult<T> =
  | { props: T }
  | { notFound: true }
  | { redirect: { destination: string; permanent?: boolean } }
export type GetServerSideProps<T = any, P = Record<string, string>> = (
  context: GetServerSidePropsContext<P>,
) => Promise<GetServerSidePropsResult<T>> | GetServerSidePropsResult<T>
export type InferGetServerSidePropsType<F> = F extends (...args: any[]) => infer R
  ? Awaited<R> extends infer X
    ? X extends { props: infer P }
      ? P
      : never
    : never
  : never
export type TalizenConfig = Record<string, unknown>
