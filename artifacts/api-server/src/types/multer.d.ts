declare module "multer" {
  import type { Request, RequestHandler } from "express";

  namespace multer {
    interface File {
      originalname: string;
      filename: string;
    }

    interface StorageEngine {}

    interface DiskStorageOptions {
      destination?: (req: Request, file: File, cb: (error: Error | null, destination: string) => void) => void;
      filename?: (req: Request, file: File, cb: (error: Error | null, filename: string) => void) => void;
    }

    interface Options {
      storage?: StorageEngine;
    }

    interface Multer {
      single(fieldName: string): RequestHandler;
    }

    function diskStorage(options: DiskStorageOptions): StorageEngine;
  }

  function multer(options?: multer.Options): multer.Multer;
  export = multer;
}
