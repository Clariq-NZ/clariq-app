#!/usr/bin/env python3
"""
Extract and chunk the regulatory corpus for Ask Clariq (Architecture 0.3, section 20.2).

Reads corpus/manifest.json, extracts text from each .docx or .pdf, strips running
page headers, splits the body into sections keyed by section number, and further
splits long sections at subsection boundaries. Writes one JSONL file per document
to corpus/extracted/ with a section_ref on every chunk so answers can cite it.

Embeddings are not computed here; they are added in the database by the
embed_chunks edge function (gte-small, 384 dimensions) after loading.

Usage:  python3 scripts/extract_corpus.py
Needs:  pip install python-docx pdfplumber
"""
import json, os, re, sys, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, 'corpus')
OUT = os.path.join(CORPUS, 'extracted')
TARGET = 1400   # characters per chunk, roughly 350 tokens
MAXLEN = 2200   # hard ceiling before a forced split

SECTION_RE = re.compile(r'^(\d{1,4}[A-Z]{0,3}(?:\.\d{1,3}[A-Z]?)?)\s+([A-Z][^\n]{2,160})$')
PART_RE = re.compile(r'^(Part \d+[A-Z]?|Chapter \d+[A-Z]?|Schedule \d+[A-Z]?|Division \d+[A-Z]?|Subpart \d+[A-Z]?)\s*(|[A-Z][^.:;]{0,80})$')
SUBSEC_RE = re.compile(r'^\((\d+[A-Z]?)\)\s')
MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
# NZ PCO running headers: "30 July 2026 Regulations 2017 Part 7 r 7.1" and mirror images of it
HEADER_RE = re.compile(r'^(Version as at|Reprinted as at)|(\b\d{1,2} (?:' + MONTHS + r') \d{4}\b.*\b(?:Act|Regulations) \d{4}\b)|(\b(?:Act|Regulations) \d{4}\b.*\b\d{1,2} (?:' + MONTHS + r') \d{4}\b)')
BODY_START_RE = re.compile(r'^1\s+(Short [Tt]itle|Title|Citation)\b(?!.*\d\s*$)')


def read_docx(path):
    import docx
    d = docx.Document(path)
    lines = []
    for p in d.paragraphs:
        t = p.text.replace('\t', ' ').strip()
        t = re.sub(r'\s{2,}', ' ', t)
        if t:
            lines.append(t)
    return lines


def read_pdf(path, title):
    import pdfplumber
    lines = []
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            text = pg.extract_text() or ''
            page_lines = text.split('\n')
            # Drop running headers and footers: the first two and last line of a page
            # when they carry the version banner, the document title or a bare page number.
            cleaned = []
            for i, l in enumerate(page_lines):
                s = l.strip()
                if not s:
                    continue
                if HEADER_RE.search(s) and len(s) < 110:
                    continue
                is_edge = i < 3 or i == len(page_lines) - 1
                if is_edge and (
                    s.startswith('Version as at') or s.startswith('Reprinted as at')
                    or s.startswith('as at ') or re.fullmatch(r'\d{1,4}', s)
                    or (title.split(' ')[0] in s and re.search(r'\b(Part|s|r|Sch)\s+\d', s))
                    or re.search(r'^\d{1,2} \w+ \d{4} .*\b(Part \d+\s+)?(s|r) \d', s)
                    or re.search(r'\b(Act 1996|Regulations 2017)\s+(Part \d+\s+)?(s|r) \d', s)
                    or re.fullmatch(r'Page \d+', s)
                ):
                    continue
                cleaned.append(s)
            lines.extend(cleaned)
    # Re-join words broken by soft hyphen at line end (NZ PCO layout)
    joined = []
    for l in lines:
        if joined and joined[-1].endswith('\u2010'):
            joined[-1] = joined[-1][:-1] + l
        else:
            joined.append(l)
    return joined


def find_body_start(lines):
    hits = [i for i, l in enumerate(lines) if BODY_START_RE.match(l) and not re.search(r'\s\d{1,4}$', l)]
    return hits[0] if hits else 0


def split_sections(lines, start):
    """Yield (context, section_ref, heading, text_lines)."""
    context = {}
    cur = None
    for l in lines[start:]:
        m = PART_RE.match(l)
        if m and len(l) < 100:
            key = m.group(1).split(' ')[0]
            context[key] = (m.group(1) + (' ' + m.group(2) if m.group(2) else '')).strip()
            for k in list(context):
                # a new Part resets Division and Subpart
                if key in ('Part', 'Chapter') and k in ('Division', 'Subpart'):
                    del context[k]
            continue
        s = SECTION_RE.match(l)
        if s and not l.rstrip().endswith('.') and len(l) < 170:
            if cur:
                yield cur
            cur = {'context': dict(context), 'ref': s.group(1), 'heading': s.group(2).strip(), 'lines': []}
            continue
        if cur:
            cur['lines'].append(l)
    if cur:
        yield cur


def chunk_section(sec, kind):
    """Split one section into chunks at subsection boundaries."""
    label = 'reg' if kind == 'regulation' else 's'
    text_lines = sec['lines']
    heading = f"{sec['ref']} {sec['heading']}"
    full = '\n'.join(text_lines)
    if len(full) <= MAXLEN:
        return [dict(section_ref=f"{label} {sec['ref']}", heading=heading, text=full)]
    # Group by subsection
    groups, curg, cursub = [], [], None
    for l in text_lines:
        m = SUBSEC_RE.match(l)
        if m and curg:
            groups.append((cursub, curg))
            curg = []
        if m:
            cursub = m.group(1)
        curg.append(l)
    if curg:
        groups.append((cursub, curg))
    chunks, buf, first, last = [], [], None, None
    def flush():
        if buf:
            ref = f"{label} {sec['ref']}"
            if first:
                ref += f"({first})" if first == last else f"({first})-({last})"
            chunks.append(dict(section_ref=ref, heading=heading, text='\n'.join(buf)))
    for sub, g in groups:
        gtxt = '\n'.join(g)
        if buf and len('\n'.join(buf)) + len(gtxt) > TARGET:
            flush(); buf, first = [], None
        if first is None:
            first = sub
        last = sub
        buf.extend(g)
        # A single subsection can still exceed the ceiling; hard-split it.
        while len('\n'.join(buf)) > MAXLEN:
            joined = '\n'.join(buf)
            cut = joined.rfind('\n', 0, MAXLEN)
            head, tail = joined[:cut], joined[cut + 1:]
            buf = head.split('\n'); flush()
            buf, first = tail.split('\n'), sub
    flush()
    return chunks


def main():
    manifest = json.load(open(os.path.join(CORPUS, 'manifest.json')))
    os.makedirs(OUT, exist_ok=True)
    summary = []
    for doc in manifest:
        path = os.path.join(CORPUS, doc['file'])
        kind = 'regulation' if 'regulation' in doc['title'].lower() else 'act'
        lines = read_docx(path) if path.endswith('.docx') else read_pdf(path, doc['title'])
        start = find_body_start(lines)
        chunks = []
        for sec in split_sections(lines, start):
            for c in chunk_section(sec, kind):
                if len(c['text'].strip()) < 40:
                    continue
                ctx = ' > '.join(v for k, v in sec['context'].items())
                chunks.append({
                    'document_file': doc['file'],
                    'section_ref': c['section_ref'],
                    'heading': c['heading'],
                    'context': ctx,
                    'text': c['text'],
                    'chars': len(c['text']),
                    'sha1': hashlib.sha1(c['text'].encode()).hexdigest(),
                })
        outp = os.path.join(OUT, os.path.basename(doc['file']) + '.jsonl')
        with open(outp, 'w') as f:
            for c in chunks:
                f.write(json.dumps(c, ensure_ascii=False) + '\n')
        secs = len({c['section_ref'].split('(')[0] for c in chunks})
        summary.append((doc['file'], secs, len(chunks), sum(c['chars'] for c in chunks)))
    print(f"{'document':55} {'sections':>8} {'chunks':>7} {'chars':>9}")
    for f, s, c, ch in summary:
        print(f"{f:55} {s:8} {c:7} {ch:9}")


if __name__ == '__main__':
    main()
