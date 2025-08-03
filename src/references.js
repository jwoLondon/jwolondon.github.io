import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import * as citeproc from 'citeproc';
import * as Inputs from '@observablehq/inputs';

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
export class Refs {
    constructor(refList, citeFac) {
        this.refObject = this.#parseBibtex(refList);
        this.citeFac = citeFac;
    }

    // This is the entry point (e.g. const bib = Refs.create(myRefDatabase);)
    static async create(refList, {
        cslLocale = 'en-GB',
        cslStyle = 'apa',
        linkCitations = true,
        linkBibliography = true
    } = {}) {
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

    // For external display raw reference list
    refTableRaw() {
        return this.refObject;
    }

    // For Observable formatted tabular output
    refTable() {
        return Inputs.table(this.refTableRaw(), { layout: "auto" })
    }

    // Cite a reference in the form Wood (2024)
    cite(...params) {
        return this.#citeProp('mode', 'composite', ...params);
    }

    // Cite a reference in the form (Wood, 2024)
    citep(...params) {
        return this.citeFac(...params);
    }

    // Cite a reference in the form (e.g. Wood, 2024)
    citeeg(...params) {
        return this.#citeProp('prefix', 'e.g. ', ...params);
    }

    // Generates a reactive bibliography based on what is cited in document.
    // Listens out for custom cite events to reactively update the bibliography.
    bibliography(options = {}) {
        const { showAll = false, showNone = false } = options;

        const container = document.createElement('div');
        let [last, raf] = ['', null];

        const update = () => {
            raf = null;
            const htmlString = this.citeFac.bibliographyRaw({ showAll, showNone });
            if (htmlString === last) {
                return;
            }
            last = htmlString;
            container.innerHTML = htmlString;
        };

        const schedule = () => {
            if (raf !== null) {
                return;
            }
            raf = requestAnimationFrame(update);
        };

        // Listen for explicit citation additions/changes
        const onCitationUpdated = (e) => {
            schedule();
        };
        document.addEventListener('citation-updated', onCitationUpdated);

        // Watch existing and future clusters for internal mutation (e.g., reprocessing)
        const clusterObservers = new WeakMap();
        const observeCluster = (clusterEl) => {
            if (clusterObservers.has(clusterEl)) {
                return;
            }
            const o = new MutationObserver(() => {
                schedule();
            });
            o.observe(clusterEl, { childList: true, subtree: true, characterData: true });
            clusterObservers.set(clusterEl, o);
        };
        // Seed existing clusters
        document.querySelectorAll('span.csl-citation-cluster').forEach(observeCluster);

        // If new clusters get inserted (e.g., via cite), hook them too
        const clusterInsertionObserver = new MutationObserver((mutations) => {
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
            document.removeEventListener('citation-updated', onCitationUpdated);
            clusterInsertionObserver.disconnect();
            for (const o of clusterObservers.values()) {
                o.disconnect();
            }
        };

        return container;
    }

    // Cleanup (removes internal listener)
    dispose() {
        if (typeof this.citeFac.dispose === 'function') {
            this.citeFac.dispose();
        }
    }

    // ------------ Private methods
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

// -----------------------------------------------------------------------------------------
// Lower level functions (not exposed in this module as the public API is entirely through the Refs class)
//
const fetchCslStyle = async function (cslStyle) {
    const response = await fetch(`https://raw.githubusercontent.com/citation-style-language/styles/master/${cslStyle}.csl`);
    if (!response.ok) {
        throw new Error(`Failed to fetch CSL style ${cslStyle}: ${response.statusText}`);
    }
    return await response.text();
};

const fetchCslLocale = async function (cslLocale) {
    const response = await fetch(`https://raw.githubusercontent.com/citation-style-language/locales/master/locales-${cslLocale}.xml`);
    if (!response.ok) {
        throw new Error(`Failed to fetch CSL locale ${cslLocale}: ${response.statusText}`);
    }
    return await response.text();
};

const citationFactory = async function (
    referenceData = ``,
    { cslStyle, cslLocale, linkCitations = true, linkBibliography = true } = {}
) {
    const citationEngineId = Math.random().toString(36).substr(2, 5);
    let removeClickListener = null;

    // scrolling/linking logic
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
        .reduce((map, reference) => {
            return map.set(reference.id, reference);
        }, new Map());
    const referenceIds = Array.from(referenceMap.keys());

    const sys = {
        retrieveLocale: () => {
            return cslLocale;
        },
        retrieveItem: (id) => {
            return referenceMap.get(id);
        },
    };

    // Inline engine for citation previews
    const inlineEngine = new citeproc.Engine(sys, cslStyle);
    inlineEngine.updateItems(referenceIds);

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

            citationItems = citationItems.map((citationItem) => {
                citationItem = typeof citationItem === 'string' ? { id: citationItem } : citationItem;
                citationItem.prefix = `<span class="csl-citation-item" data-citation-engine-id="${citationEngineId}" data-citation-item-id="${citationItem.id}">${citationItem.prefix ? citationItem.prefix : ''
                    }${linkCitations ? `<a class="csl-link" href="#${citationItem.id}" data-citation-engine-id="${citationEngineId}">` : ''}`;
                citationItem.suffix = `${linkCitations ? `</a>` : ''}${citationItem.suffix ? citationItem.suffix : ''
                    }</span>`;
                return citationItem;
            });

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

            // Fire a citation event so bibliograph will update 
            if (typeof window !== 'undefined') {
                document.dispatchEvent(new CustomEvent('citation-updated', { detail: { engine: citationEngineId } }));
            }
            return citationTag;
        } catch (e) {
            const err = document.createElement('span');
            err.style.padding = '0 5px';
            err.style.backgroundColor = 'red';
            err.style.color = 'white';
            err.innerHTML = `<span style="font-weight:bold;">Citation error:</span> ${e}`;
            return err;
        }
    }

    // Bibliography builder (raw HTML string)
    cite.bibliographyRaw = function ({ showAll = false, showNone = false } = {}) {
        // Find current citation item and cluster tags scoped to this engine
        const citationItemTags = Array.from(
            document.querySelectorAll(
                `span.csl-citation-item[data-citation-engine-id="${citationEngineId}"]`
            )
        );

        const citationClusterTags = Array.from(
            document.querySelectorAll(
                `span.csl-citation-cluster[data-citation-engine-id="${citationEngineId}"]`
            )
        );

        const haveCitationItems = citationItemTags.length > 0;

        if (!referenceIds.length) {
            return `<b>No references?</b>`;
        }

        if (showNone) {
            return ``;
        }

        let bibliographyEngine;
        let offlineEngine;

        if (showAll) {
            bibliographyEngine = new citeproc.Engine(sys, cslStyle);
            bibliographyEngine.opt.development_extensions.wrap_url_and_doi = linkBibliography;
            bibliographyEngine.updateUncitedItems(referenceIds);
        } else {
            if (!haveCitationItems) {
                return `<b>No citations!</b>`;
            }

            offlineEngine = new citeproc.Engine(sys, cslStyle);
            offlineEngine.opt.development_extensions.wrap_url_and_doi = linkBibliography;
            offlineEngine.updateItems(referenceIds);

            // Process all clusters to update their displayed text (mutates DOM like previous)
            const processedClusterList = [];
            const processedClusterMap = new Map();

            citationClusterTags.forEach((citationClusterTag) => {
                const processedClusterData = offlineEngine.processCitationCluster(
                    citationClusterTag.citationCluster,
                    processedClusterList,
                    []
                );
                processedClusterData[1].forEach((processedCluster) => {
                    processedClusterMap.set(
                        processedCluster[2],
                        processedCluster[1].replace(/&#60;/g, '<').replace(/&#62;/g, '>')
                    );
                });
                processedClusterList.push([citationClusterTag.citationCluster.citationID, 0]);
            });

            // Update inline citation cluster DOM if present
            citationClusterTags.forEach((citationClusterTag) => {
                const id = citationClusterTag.citationCluster.citationID;
                const updated = processedClusterMap.get(id);
                if (updated != null) {
                    citationClusterTag.innerHTML = updated;
                }
            });

            bibliographyEngine = offlineEngine;
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
    };

    // Expose dispose
    cite.dispose = function () {
        if (removeClickListener) {
            removeClickListener();
            removeClickListener = null;
        }
    };

    return cite;
};
