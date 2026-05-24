declare module "pngjs" {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): { width: number; height: number; data: Buffer | Uint8Array };
      write(image: { width: number; height: number; data: Buffer | Uint8Array }): Buffer;
    };
  }
}
