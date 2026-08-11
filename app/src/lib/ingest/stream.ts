// Line-at-a-time reader for a browser File.
//
// Browser-only counterpart to the CLI's `readline` over a read stream. The
// largest transcript measured on disk is 202 MB, so `file.text()` is not an
// option: it materializes the whole session as one string before the first
// record can be parsed. Streaming lets a session be indexed while it loads.

export interface FileLineOptions {
  /** Called with bytes decoded so far, for progress reporting. */
  onProgress?: (bytesRead: number) => void;
}

export async function* fileLines(
  file: File,
  options: FileLineOptions = {}
): AsyncGenerator<string> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let bytesRead = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.length;
      options.onProgress?.(bytesRead);
      buffer += value;

      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        yield buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
      }
    }
    // A transcript's last line may have no trailing newline.
    if (buffer.length > 0) yield buffer;
  } finally {
    reader.releaseLock();
  }
}
