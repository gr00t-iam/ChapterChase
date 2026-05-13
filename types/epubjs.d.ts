declare module "epubjs" {
  const ePub: (input: ArrayBuffer) => {
    ready: Promise<unknown>;
    load: (path: string) => Promise<unknown>;
    destroy: () => void;
    spine?: {
      spineItems?: Array<{
        load: (loader: (path: string) => Promise<unknown>) => Promise<Document>;
        unload: () => void;
      }>;
    };
  };

  export default ePub;
}
