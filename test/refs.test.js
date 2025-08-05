import Refs from '../docs/dist/references.js';

const simpleBib = `
@article{smith2020,
  author = {Smith, Alice and Jones, Bob},
  title = {A Simple Test},
  journal = {Journal of Testing},
  year = {2020},
  doi = {10.1234/test}
}
`;

describe('Refs test', () => {
    let bib;

    beforeAll(async () => {
        // create a Refs instance with the simple BibTeX string
        bib = await Refs.create(simpleBib, { linkCitations: false, linkBibliography: false });
    });

    test('refTableRaw returns the correct id and title', () => {
        const raw = bib.refTableRaw();
        expect(Array.isArray(raw)).toBe(true);
        expect(raw.length).toBe(1);
        expect(raw[0].name).toBe('smith2020');
        expect(raw[0].title).toMatch(/Simple Test/);
    });

    test('bibliographyRaw contains author names', () => {
        const html = bib.citep('smith2020').toString();          // inline citation
        const bibHtml = bib.bibliography({ showAll: true });     // Force full bibliography
        const str = bibHtml.innerHTML || bibHtml;                // Could be string or element
        expect(str).toMatch(/Smith, A\./);
        expect(str).toMatch(/<span class="csl-author">Smith, A\./);
        expect(str).toMatch(/2020/);
    });
});