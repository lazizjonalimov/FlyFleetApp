// A minimal PDF writer for journeys: pages of Helvetica text at given positions (points from the bottom-left).
// Enough for the built-in reader to read, without a library.

export function textPdf(pages: [x: number, y: number, text: string][][], size: [number, number] = [612, 792]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pagesId = 1 + 2 * pages.length + 1;
  const pageIds: number[] = [];
  for (const lines of pages) {
    const stream = lines.map(([x, y, t]) => `BT /F1 10 Tf ${x} ${y} Td (${t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}) Tj ET`).join("\n");
    add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const content = objects.length;
    add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${size[0]} ${size[1]}] /Contents ${content} 0 R /Resources << /Font << /F1 1 0 R >> >> >>`);
    pageIds.push(objects.length);
  }
  add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A VIN with its check digit worked out, so it decodes as valid. */
export function validVin(prefix: string, rest: string): string {
  const values: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const draft = `${prefix}0${rest}`;
  const sum = [...draft].reduce((total, c, i) => total + (/\d/.test(c) ? Number(c) : values[c]!) * weights[i]!, 0);
  return `${prefix}${sum % 11 === 10 ? "X" : String(sum % 11)}${rest}`;
}
