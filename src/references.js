import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import * as citeproc from 'citeproc';
import * as Inputs from '@observablehq/inputs';
import '@observablehq/inputs/dist/index.css';

// ------------------------------------------------------------------------------------------------------------
// Refs is the top level class with bibtex input and ASA style bibliographic output formats.
// It is designed for latex-style easy citation using Observable framework / notebook 2.
// For standard hosted Observable pages, see this instead: https://observablehq.com/@gicentre/references-class
// Both build on Citation Factory by Adam Krawitz: https://observablehq.com/@akrawitz/citation-factory
// which in turn builds on citeproc.js: https://citeproc-js.readthedocs.io/en/latest/
// and Citation.js: https://citation.js.org 
// See Willighagen, L. G. (2019). Citation.js: a format-independent, modular bibliography tool
// for the browser and command line. PeerJ Computer Science, 5, e214. https://doi.org/10.7717/peerj-cs.214
// ------------------------------------------------------------------------------------------------------------

class Refs {
    constructor(refList, citeFac) {
        this.citeFac = citeFac;
        this._bibliographyContainers = new Set();

        // Build refObject from the parsed CSL-JSON if available; fallback to naive parsing
        if (citeFac?.referenceMap instanceof Map) {
            this.refObject = Array.from(citeFac.referenceMap.values()).map((r) => {
                let title = '';
                if (typeof r.title === 'string') {
                    title = r.title;
                } else if (Array.isArray(r.title)) {
                    title = r.title.map((t) => (typeof t === 'string' ? t : t['title'] || '')).join('; ');
                } else if (r.title && typeof r.title === 'object') {
                    title = r.title['title'] || '';
                }
                return {
                    name: r.id,
                    title: title.replace(/[{}]/g, ''),
                    type: r.type,
                };
            });
        } else {
            this.refObject = this.#parseBibtex(refList);
        }
    }

    // This is the main entry point.
    static async create(
        refList,
        { cslLocale = 'en-GB', cslStyle = 'apa', linkCitations = true, linkBibliography = true } = {}
    ) {

        const styleText = await fetchCslStyle(cslStyle);
        const localeText = await fetchCslLocale(cslLocale);
        const citeFac = await citationFactory(refList, {
            cslLocale: localeText,
            cslStyle: styleText,
            linkCitations,
            linkBibliography,
        });
        return new Refs(refList, citeFac);
    }

    refTableRaw() {
        return this.refObject;
    }

    refTable() {
        return Inputs.table(this.refTableRaw(), { layout: 'auto' });
    }

    cite(...params) {
        return this.#citeProp('mode', 'composite', ...params);
    }

    citep(...params) {
        return this.citeFac(...params);
    }

    citeeg(...params) {
        return this.#citeProp('prefix', 'e.g. ', ...params);
    }

    bibliography({ showAll = false, showNone = false } = {}) {
        const container = document.createElement('div');
        let last = '';
        let raf = null;

        const update = () => {
            raf = null;
            let htmlString;
            try {
                htmlString = this.citeFac.bibliographyRaw({ showAll, showNone });
            } catch (e) {
                htmlString = `<div style="color:red;"><strong>Bibliography error:</strong> ${String(e)}</div>`;
            }
            if (htmlString === last) return;
            last = htmlString;

            // 1) Render the raw HTML
            container.innerHTML = htmlString;

            // 2) Post-process each entry to wrap the "Last, I." part
            for (const entry of container.querySelectorAll('.csl-entry')) {
                entry.innerHTML = entry.innerHTML.replace(
                    // capture: any text up to the year in parentheses
                    /^([^<]+?)(\s*\(\d{4}\))/,
                    (_, authors, rest) => `<span class="csl-author">${authors}</span>${rest}`
                );
            }
        };

        const schedule = () => {
            if (raf !== null) return;
            raf = requestAnimationFrame(update);
        };

        const onCitationUpdated = e => {
            if (e?.detail?.engine !== this.citeFac?.citationEngineId) return;
            schedule();
        };
        document.addEventListener(CITATION_UPDATED, onCitationUpdated);

        const clusterObservers = new WeakMap();
        const observeCluster = clusterEl => {
            if (clusterObservers.has(clusterEl)) return;
            const o = new MutationObserver(schedule);
            o.observe(clusterEl, { childList: true, subtree: true, characterData: true });
            clusterObservers.set(clusterEl, o);
        };
        for (const el of document.querySelectorAll(clusterSelector(this.citeFac.citationEngineId))) {
            observeCluster(el);
        }
        const clusterInsertionObserver = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node instanceof Element && node.matches('span.csl-citation-cluster')) {
                        observeCluster(node);
                    }
                }
            }
        });
        clusterInsertionObserver.observe(document.body, { childList: true, subtree: true });

        // Initial render
        update();

        container.dispose = () => {
            document.removeEventListener(CITATION_UPDATED, onCitationUpdated);
            clusterInsertionObserver.disconnect();
            for (const o of clusterObservers.values()) o.disconnect();
        };

        const originalDispose = container.dispose;
        container.dispose = () => {
            originalDispose();
            this._bibliographyContainers.delete(container);
        };
        this._bibliographyContainers.add(container);

        return container;
    }

    dispose() {
        if (typeof this.citeFac?.dispose === 'function') {
            this.citeFac.dispose();
        }
        for (const c of this._bibliographyContainers) {
            if (typeof c.dispose === 'function') {
                c.dispose();
            }
        }
        this._bibliographyContainers.clear();
    }

    // ------------ Private methods

    // Fallback, rarely used if citationFactory provides referenceMap
    #parseBibtex(bibtexString) {
        const entries = [];
        const regex = /@(\w+)\s*{\s*([^,]+),[^@]*?title\s*=\s*[{"]([^"}]+)[}"]/g;

        let match;
        while ((match = regex.exec(bibtexString)) !== null) {
            const [type, name, rTitle] = match.slice(1, 4).map((d) => d.trim());
            entries.push({ name, title: rTitle.replace(/[{}]/g, ''), type });
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        return entries;
    }

    #citeProp(k, v, ...params) {
        if (
            params.length &&
            typeof params[params.length - 1] === 'object' &&
            !params[params.length - 1].hasOwnProperty('id')
        ) {
            const cProps = params.pop();
            return this.citeFac(...params, { ...cProps, [k]: v });
        }
        return this.citeFac(...params, { [k]: v });
    }
}

// --------------------------------------------------------------------------
//  A refactored version of CitationFactory with explicit tracking of citations

const STYLE_CACHE = new Map();
const LOCALE_CACHE = new Map();
const CITATION_UPDATED = 'refs:citation-updated';

async function fetchCslStyle(name) {
    if (STYLE_CACHE.has(name)) {
        return STYLE_CACHE.get(name);
    }
    const response = await fetch(
        `https://raw.githubusercontent.com/citation-style-language/styles/master/${name}.csl`
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch CSL style ${name}: ${response.statusText}`);
    }
    const text = await response.text();
    STYLE_CACHE.set(name, text);
    return text;
}

async function fetchCslLocale(name) {
    if (LOCALE_CACHE.has(name)) {
        return LOCALE_CACHE.get(name);
    }
    const response = await fetch(
        `https://raw.githubusercontent.com/citation-style-language/locales/master/locales-${name}.xml`
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch CSL locale ${name}: ${response.statusText}`);
    }
    const text = await response.text();
    LOCALE_CACHE.set(name, text);
    return text;
}

const clusterSelector = (engineId) =>
    `span.csl-citation-cluster[data-citation-engine-id="${engineId}"]`;

const citationFactory = async function (
    referenceData = ``,
    { cslStyle, cslLocale, linkCitations = true, linkBibliography = true } = {}
) {
    const citationEngineId = Math.random().toString(36).slice(2, 7);
    let removeClickListener = null;
    const citedIds = new Set();
    let lastCitedKey = '';
    let cachedOfflineEngine = null;
    let cachedShowAllEngine = null;

    // Scrolling/linking logic
    const scrollToBibliographyEntry = (event) => {
        const sourceLink = event.target;
        if (
            sourceLink instanceof HTMLAnchorElement &&
            sourceLink.classList.contains('csl-link') &&
            sourceLink.getAttribute('href')?.match(/^#/)
        ) {
            const destinationEntry = document.querySelector(
                `.csl-entry${sourceLink.hash}[data-citation-engine-id="${sourceLink.dataset.citationEngineId}"]`
            );
            if (destinationEntry) {
                event.preventDefault();
                destinationEntry.scrollIntoView();
            }
        }
    };
    if (linkCitations) {
        document.addEventListener('click', scrollToBibliographyEntry);
        removeClickListener = () => {
            document.removeEventListener('click', scrollToBibliographyEntry);
        };
    }

    // Parse reference data into CSL-JSON map
    const referenceMap = (await Cite.async(referenceData, { generateGraph: false }))
        .format('data', { format: 'object' })
        .reduce((map, reference) => map.set(reference.id, reference), new Map());
    const referenceIds = Array.from(referenceMap.keys());

    const sys = {
        retrieveLocale: () => cslLocale,
        retrieveItem: (id) => referenceMap.get(id),
    };

    // Inline engine for citation previews
    const inlineEngine = new citeproc.Engine(sys, cslStyle);
    inlineEngine.updateItems(referenceIds);

    // Helpers
    const wrapCitationItem = (raw, engineId, linkCitationsFlag) => {
        const item = typeof raw === 'string' ? { id: raw } : { ...raw };
        const prefixInner = item.prefix || '';
        const suffixInner = item.suffix || '';
        const linkStart = linkCitationsFlag
            ? `<a class="csl-link" href="#${item.id}" data-citation-engine-id="${engineId}">`
            : '';
        const linkEnd = linkCitationsFlag ? `</a>` : '';
        item.prefix = `<span class="csl-citation-item" data-citation-engine-id="${engineId}" data-citation-item-id="${item.id}">${prefixInner}${linkStart}`;
        item.suffix = `${linkEnd}${suffixInner}</span>`;
        return item;
    };

    const makeOfflineEngine = (ids) => {
        const engine = new citeproc.Engine(sys, cslStyle);
        engine.opt.development_extensions.wrap_url_and_doi = linkBibliography;
        engine.updateItems(ids);
        return engine;
    };

    const makeShowAllEngine = () => {
        const engine = new citeproc.Engine(sys, cslStyle);
        engine.opt.development_extensions.wrap_url_and_doi = linkBibliography;
        engine.updateUncitedItems(referenceIds);
        return engine;
    };

    // Main cite function
    function cite(...citationItems) {
        try {
            const citationProperties =
                citationItems.length &&
                    typeof citationItems[citationItems.length - 1] === 'object' &&
                    !citationItems[citationItems.length - 1].hasOwnProperty('id')
                    ? citationItems.pop()
                    : {};
            citationProperties.noteIndex = 0;

            citationItems = citationItems.map((ci) =>
                wrapCitationItem(ci, citationEngineId, linkCitations)
            );

            for (const ci of citationItems) {
                if (ci && ci.id) {
                    citedIds.add(ci.id);
                }
            }

            const citationCluster = {
                citationItems: citationItems,
                properties: citationProperties,
            };

            const citationPreview = inlineEngine
                .previewCitationCluster(citationCluster, [], [], 'html')
                .replace(/&#60;/g, '<')
                .replace(/&#62;/g, '>');

            const citationTag = document.createElement('span');
            citationTag.className = 'csl-citation-cluster';
            citationTag.dataset.citationEngineId = citationEngineId;
            citationTag.innerHTML = citationPreview;
            citationTag.citationCluster = citationCluster;

            if (typeof window !== 'undefined') {
                document.dispatchEvent(
                    new CustomEvent(CITATION_UPDATED, { detail: { engine: citationEngineId } })
                );
            }

            return citationTag;
        } catch (e) {
            const err = document.createElement('span');
            err.style.padding = '0 5px';
            err.style.backgroundColor = 'red';
            err.style.color = 'white';

            const bold = document.createElement('span');
            bold.style.fontWeight = 'bold';
            bold.textContent = 'Citation error: ';

            const msg = document.createTextNode(String(e));
            err.append(bold, msg);
            return err;
        }
    }

    // Attach internal metadata for consumers
    cite.referenceMap = referenceMap;
    cite.citationEngineId = citationEngineId;

    // Bibliography builder
    cite.bibliographyRaw = function ({ showAll = false, showNone = false } = {}) {
        try {
            if (!referenceIds.length) {
                return `<b>No references?</b>`;
            }
            if (showNone) {
                return ``;
            }

            let bibliographyEngine;

            if (showAll) {
                if (!cachedShowAllEngine) {
                    cachedShowAllEngine = makeShowAllEngine();
                }
                bibliographyEngine = cachedShowAllEngine;
            } else {
                if (citedIds.size === 0) {
                    return `<b>No citations!</b>`;
                }
                const sorted = Array.from(citedIds).sort();
                const key = sorted.join('|');
                if (key !== lastCitedKey || !cachedOfflineEngine) {
                    cachedOfflineEngine = makeOfflineEngine(sorted);
                    lastCitedKey = key;
                }
                bibliographyEngine = cachedOfflineEngine;
            }

            const citationClusterTags = Array.from(
                document.querySelectorAll(
                    `span.csl-citation-cluster[data-citation-engine-id="${citationEngineId}"]`
                )
            );

            if (!showAll && citationClusterTags.length) {
                const processedClusterList = [];
                const processedClusterMap = new Map();

                for (const citationClusterTag of citationClusterTags) {
                    const processedClusterData = bibliographyEngine.processCitationCluster(
                        citationClusterTag.citationCluster,
                        processedClusterList,
                        []
                    );
                    const clusters = processedClusterData[1];
                    for (const processedCluster of clusters) {
                        processedClusterMap.set(
                            processedCluster[2],
                            processedCluster[1].replace(/&#60;/g, '<').replace(/&#62;/g, '>')
                        );
                    }
                    processedClusterList.push([citationClusterTag.citationCluster.citationID, 0]);
                }

                for (const citationClusterTag of citationClusterTags) {
                    const id = citationClusterTag.citationCluster.citationID;
                    const updated = processedClusterMap.get(id);
                    if (updated != null) {
                        citationClusterTag.innerHTML = updated;
                    }
                }
            }

            const bibliographyObject = bibliographyEngine.makeBibliography();

            const bibliographyEntries = bibliographyObject[1].map((entry, index) => {
                return entry.replace(
                    '<div',
                    `<div id="${bibliographyObject[0].entry_ids[index]}" data-citation-engine-id="${citationEngineId}"`
                );
            });

            const bibliographyString =
                bibliographyObject[0].bibstart +
                bibliographyEntries.reduce((acc, e) => acc + e, '') +
                bibliographyObject[0].bibend;

            const bibliographyStyles = `
  <style>
    .csl-entry[data-citation-engine-id="${citationEngineId}"] {
      line-height: ${bibliographyObject[0].linespacing * 0.8};
      ${bibliographyObject[0].hangingindent ? `
        padding-left: 1rem;
        text-indent: -1rem;
      ` : ``};
    }
  </style>
  `;

            return `<div data-citation-engine-id="${citationEngineId}">${bibliographyStyles}${bibliographyString}</div>`;
        } catch (e) {
            return `<div style="color:red;"><strong>Bibliography error:</strong> ${String(e)}</div>`;
        }
    };

    cite.dispose = function () {
        if (removeClickListener) {
            removeClickListener();
            removeClickListener = null;
        }
    };

    return cite;
};

// Just export the Refs class as the default in the bundled package
export default Refs;