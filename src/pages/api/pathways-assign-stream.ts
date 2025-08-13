import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

import { classificationCache } from '@/lib/cache';

type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PathwayRow {
  Pathway: string;
  'Pathway Class': string | null;
  Subclass: string | null;
  Species: string;
  Source: string;
  URL: string;
}

function batchArray<T>(arr: T[], size: number): T[][] {
  const batches = [];
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size));
  }
  return batches;
}

// Fallback classification function using EXACT Reactome terminology
function classifyPathwayFallback(pathwayName: string): {
  class: string;
  subclass: string;
} {
  const name = pathwayName.toLowerCase();

  // Metabolism patterns (using exact Reactome names with proper subclasses)
  if (name.includes('metabolism') || name.includes('metabolic')) {
    if (name.includes('amino acid') || name.includes('serine')) {
      return {
        class: 'Metabolism',
        subclass: 'Metabolism of amino acids and derivatives',
      };
    }
    if (name.includes('rna') || name.includes('splicing')) {
      return { class: 'Metabolism', subclass: 'Metabolism of RNA' };
    }
    return { class: 'Metabolism', subclass: 'Metabolism of proteins' };
  }

  // Drug/Biotransformation patterns (using exact Reactome names)
  if (
    name.includes('biotransformation') ||
    name.includes('acrylamide') ||
    name.includes('exposure') ||
    name.includes('biomarker')
  ) {
    return { class: 'Drug ADME', subclass: 'Xenobiotic metabolism' };
  }

  // Signaling patterns (using exact Reactome names)
  if (name.includes('signaling') || name.includes('signal')) {
    if (name.includes('erbb') || name.includes('erb')) {
      return { class: 'Signal Transduction', subclass: 'Signaling by ERBB4' };
    }
    if (
      name.includes('akt') ||
      name.includes('pi3k') ||
      name.includes('pip3')
    ) {
      return {
        class: 'Signal Transduction',
        subclass: 'PIP3 activates AKT signaling',
      };
    }
    if (name.includes('tgf') || name.includes('smad')) {
      return {
        class: 'Signal Transduction',
        subclass: 'Signaling by TGF-beta Receptor Complex',
      };
    }
    if (
      name.includes('rho') ||
      name.includes('rac') ||
      name.includes('gtpase')
    ) {
      return {
        class: 'Signal Transduction',
        subclass: 'Signaling by Rho GTPases',
      };
    }
    if (
      name.includes('mapk') ||
      name.includes('raf') ||
      name.includes('kinase')
    ) {
      return {
        class: 'Signal Transduction',
        subclass: 'MAPK family signaling cascades',
      };
    }
    if (name.includes('met') || name.includes('receptor tyrosine')) {
      return {
        class: 'Signal Transduction',
        subclass: 'Signaling by Receptor Tyrosine Kinases',
      };
    }
    return {
      class: 'Signal Transduction',
      subclass: 'Intracellular signaling by second messengers',
    };
  }

  // Immune system patterns
  if (
    name.includes('immune') ||
    name.includes('tcr') ||
    name.includes('mhc') ||
    name.includes('antigen')
  ) {
    if (name.includes('adaptive') || name.includes('t cell')) {
      return { class: 'Immune System', subclass: 'Adaptive Immune System' };
    }
    return {
      class: 'Immune System',
      subclass: 'Cytokine Signaling in Immune system',
    };
  }

  // Gene expression patterns
  if (
    name.includes('transcription') ||
    name.includes('rna') ||
    name.includes('splicing') ||
    name.includes('mrna')
  ) {
    return {
      class: 'Gene expression (Transcription)',
      subclass: 'mRNA Splicing',
    };
  }

  // Cell cycle patterns
  if (name.includes('cell cycle') || name.includes('mitosis')) {
    return { class: 'Cell Cycle', subclass: 'Mitotic Cell Cycle' };
  }

  // Neuronal system patterns
  if (
    name.includes('neuron') ||
    name.includes('synapse') ||
    name.includes('neurotransmitter')
  ) {
    return {
      class: 'Neuronal System',
      subclass: 'Transmission across Chemical Synapses',
    };
  }

  // Cell communication patterns
  if (name.includes('cell-cell') || name.includes('adherens')) {
    return {
      class: 'Cell-Cell communication',
      subclass: 'Adherens junctions interactions',
    };
  }

  // Programmed cell death patterns
  if (name.includes('apoptosis') || name.includes('death')) {
    return { class: 'Programmed Cell Death', subclass: 'Apoptosis' };
  }

  // Default fallback
  return { class: 'Metabolism', subclass: 'Metabolism of proteins' };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  const startTime = Date.now();
  const data: PathwayRow[] = req.body.pathways;
  const resetCache = req.body.resetCache || false; // New parameter to reset cache

  if (!Array.isArray(data) || data.length === 0) {
    res.write(
      `data: ${JSON.stringify({ error: 'Invalid or empty pathways data' })}\n\n`
    );
    res.end();
    return;
  }

  try {
    // Send initial progress
    res.write(
      `data: ${JSON.stringify({
        type: 'progress',
        message: 'Starting pathway classification...',
        processed: 0,
        total: data.length,
        percentage: 0,
      })}\n\n`
    );

    const examples = data
      .filter(
        (row) =>
          row.Source === 'Reactome' && row['Pathway Class'] && row.Subclass
      )
      .slice(0, 5)
      .map((row) => ({
        pathway: row.Pathway,
        class: row['Pathway Class'],
        subclass: row.Subclass,
      }));

    const systemPrompt = `
      You are a biomedical expert classifying human biological pathways using EXACT Reactome terminology.

      REQUIREMENTS:
      - Use ONLY exact Reactome pathway names
      - Assign BOTH class AND subclass for every pathway
      - Never use "Unknown" or "N/A" for subclasses

      HIERARCHY: Class (top-level) → Subclass (intermediate) → Pathway (specific)

      MAJOR CLASSES: Metabolism, Signal Transduction, Gene expression (Transcription), Immune System, Cell Cycle, Developmental Biology, Neuronal System, DNA Replication, DNA Repair, Cell-Cell communication, Transport of small molecules, Vesicle-mediated transport, Programmed Cell Death, Autophagy, Chromatin organization, Protein localization, Cellular responses to stimuli, Hemostasis, Muscle contraction, Organelle biogenesis and maintenance, Sensory Perception, Drug ADME, Digestion and absorption, Extracellular matrix organization

      COMMON SUBCLASSES:
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Metabolism of amino acids and derivatives"
      - Signal Transduction: "Signaling by Receptor Tyrosine Kinases", "MAPK family signaling cascades", "Signaling by Rho GTPases", "Intracellular signaling by second messengers"
      - Immune System: "Adaptive Immune System", "Cytokine Signaling in Immune system", "Innate Immune System"
      - Gene Expression: "RNA Polymerase II Transcription", "Processing of Capped Intron-Containing Pre-mRNA", "mRNA Splicing"
      - Neuronal System: "Transmission across Chemical Synapses", "Neurotransmitter receptors and postsynaptic signal transmission"
      - Cell-Cell Communication: "Cell junction organization", "Adherens junctions interactions", "Gap junction trafficking"
      - Programmed Cell Death: "Apoptosis", "Necroptosis", "Autophagy"
      - Drug ADME: "Xenobiotic metabolism", "Drug metabolism", "Phase I - Functionalization of compounds"
      - Developmental Biology: "Nervous system development", "Axon guidance", "Semaphorin interactions"
      - Extracellular Matrix: "Collagen formation", "Collagen biosynthesis and modifying enzymes", "Assembly of collagen fibrils and other multimeric structures"
      - Generic Transcription Pathway
      - Transcriptional activity of SMAD2/SMAD3:SMAD4 heterotrimer
      - Visual phototransduction
      - The phototransduction cascade
      - Inactivation, recovery and regulation of the phototransduction cascade
      - Negative regulation of the PI3K/AKT network
      - Semaphorin interactions
      - Sema4D in semaphorin signaling
      - Sema4D mediated inhibition of cell attachment and migration
      - Axon guidance
      - RAF/MAP kinase cascade
      - MAPK family signaling cascades
      - MAPK1/MAPK3 signaling
      - Signaling by MET
      - MET Receptor Activation
      - Negative regulation of MET activity
      - PI5P, PP2A and IER3 Regulate PI3K/AKT Signaling
      - MET activates RAS signaling
      - MET activates PI3K/AKT signaling
      - MET activates PTPN11
      - MET activates PTK2 signaling
      - MET interacts with TNS proteins
      - MET activates RAP1 and RAC1
      - MET receptor recycling
      - MET activates STAT3
      - MET promotes cell motility
      - Intracellular signaling by second messengers
      - Signaling by Receptor Tyrosine Kinases
      - Nervous system development
      - Drug-mediated inhibition of MET activation
      - Neurotransmitter receptors and postsynaptic signal transmission
      - Transmission across Chemical Synapses
      - Nephrin family interactions

      RESPONSE FORMAT:
      Pathway: <pathway name>
      Class: <exact Reactome class name>
      Subclass: <exact Reactome subclass name>

      RULES: Always assign both class and subclass. Use biological logic to choose the best fit subclass.
    `;

    const messages: Message[] = [{ role: 'system', content: systemPrompt }];

    const reactomeRows = data.filter((r) => r.Source === 'Reactome');
    const others = data.filter((r) => r.Source !== 'Reactome');

    // Reset cache if requested
    if (resetCache) {
      classificationCache.clearMemory();
      console.log('In-memory cache cleared for fresh classification');
    }

    const batchSize = 50;
    const batches = batchArray(others, batchSize);
    const concurrencyLimit = 5;
    const updatedOthers: (PathwayRow & {
      Pathway_Class_assigned: string;
      Subclass_assigned: string;
    })[] = [];

    let processedCount = 0;
    const totalPathways = others.length;

    // Process batches in chunks
    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const batchChunk = batches.slice(i, i + concurrencyLimit);

      // Send progress update
      const percentage = Math.round((processedCount / totalPathways) * 100);
      res.write(
        `data: ${JSON.stringify({
          type: 'progress',
          message: `Processing batch ${
            Math.floor(i / concurrencyLimit) + 1
          }/${Math.ceil(batches.length / concurrencyLimit)}`,
          processed: processedCount,
          total: totalPathways,
          percentage,
        })}\n\n`
      );

      const batchPromises = batchChunk.map(async (batch) => {
        // Check cache (persistent + memory) first and separate cached vs uncached pathways
        const uncachedPathways: PathwayRow[] = [];
        const cachedResults: {
          pathway: string;
          classAssigned: string;
          subclassAssigned: string;
        }[] = [];

        const cacheLookup = resetCache
          ? {}
          : await classificationCache.getMany(batch.map((b) => b.Pathway));

        batch.forEach((row) => {
          const hit = cacheLookup[row.Pathway];
          if (hit) {
            cachedResults.push({
              pathway: row.Pathway,
              classAssigned: hit.class,
              subclassAssigned: hit.subclass,
            });
          } else {
            uncachedPathways.push(row);
          }
        });

        // If all pathways are cached, return cached results
        if (uncachedPathways.length === 0) {
          // cachedResults contains all info we need, map back to row order
          return batch.map((row) => {
            const cached = cachedResults.find(
              (c) => c.pathway === row.Pathway
            )!;
            return {
              ...row,
              Pathway_Class_assigned: cached.classAssigned,
              Subclass_assigned: cached.subclassAssigned,
            };
          });
        }

        // Process only uncached pathways
        const batchPrompt = uncachedPathways
          .map((r) => `Pathway: ${r.Pathway}`)
          .join('\n');

        const userPrompt: Message = {
          role: 'user',
          content: `Classify the following pathways. You MUST provide BOTH class and subclass for each pathway - never leave subclass empty or as N/A.

          Provide results in this exact format for each pathway:

          Pathway: <pathway name>
          Class: <exact Reactome class name>
          Subclass: <exact Reactome subclass name - REQUIRED>

          REMEMBER: Every pathway needs both a class AND a meaningful subclass based on the hierarchical examples provided.

          Pathways:
          ${batchPrompt}`,
        };

        try {
          // Retry logic for API calls
          let retries = 3;
          let response: OpenAI.Chat.Completions.ChatCompletion;

          while (retries > 0) {
            try {
              response = await openai.chat.completions.create({
                model: 'gpt-4o',
                temperature: 0.3,
                messages: [...messages, userPrompt],
              });
              break;
            } catch (apiError: any) {
              retries--;
              if (retries === 0) {
                throw apiError;
              }
              await new Promise((resolve) =>
                setTimeout(resolve, (3 - retries) * 1000)
              );
            }
          }

          const text = response!.choices[0].message?.content ?? '';

          const classifications = text.split('\n\n').map((block) => {
            const lines = block.trim().split('\n');
            const pathwayLine =
              lines.find((l) => l.startsWith('Pathway:')) || '';
            const classLine = lines.find((l) => l.startsWith('Class:')) || '';
            const subclassLine =
              lines.find((l) => l.startsWith('Subclass:')) || '';
            return {
              pathway: pathwayLine
                ? pathwayLine.replace('Pathway:', '').trim()
                : '',
              classAssigned: classLine
                ? classLine.replace('Class:', '').trim() || 'Unknown'
                : 'Unknown',
              subclassAssigned: subclassLine
                ? subclassLine.replace('Subclass:', '').trim() || 'Unknown'
                : 'Unknown',
            };
          });

          // Cache the new classifications
          await classificationCache.setMany(
            classifications
              .filter(
                (c) =>
                  c.pathway && c.classAssigned && c.classAssigned !== 'Unknown'
              )
              .map((c) => ({
                pathwayName: c.pathway,
                value: { class: c.classAssigned, subclass: c.subclassAssigned },
              }))
          );

          // Combine cached and new results
          const allResults = [...cachedResults, ...classifications];

          const resultRows: (PathwayRow & {
            Pathway_Class_assigned: string;
            Subclass_assigned: string;
          })[] = [];
          const writePromises: Promise<void>[] = [];

          for (const row of batch) {
            const match = allResults.find((c) => c.pathway === row.Pathway);

            let classAssigned = match?.classAssigned ?? 'Unknown';
            let subclassAssigned = match?.subclassAssigned ?? 'Unknown';

            if (classAssigned === 'Unknown' || subclassAssigned === 'Unknown') {
              const fallbackClassification = classifyPathwayFallback(
                row.Pathway
              );
              classAssigned =
                classAssigned === 'Unknown'
                  ? fallbackClassification.class
                  : classAssigned;
              subclassAssigned =
                subclassAssigned === 'Unknown'
                  ? fallbackClassification.subclass
                  : subclassAssigned;
            }

            if (classAssigned !== 'Unknown' && subclassAssigned !== 'Unknown') {
              writePromises.push(
                classificationCache.set(row.Pathway, {
                  class: classAssigned,
                  subclass: subclassAssigned,
                })
              );
            }

            resultRows.push({
              ...row,
              Pathway_Class_assigned: classAssigned,
              Subclass_assigned: subclassAssigned,
            });
          }

          await Promise.all(writePromises);
          return resultRows;
        } catch (err) {
          console.error('OpenAI batch error:', err);
          return batch.map((row) => ({
            ...row,
            Pathway_Class_assigned: 'Unknown',
            Subclass_assigned: 'Unknown',
          }));
        }
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((result) => {
        updatedOthers.push(...result);
        processedCount += result.length;
      });
    }

    const updatedReactome = reactomeRows.map((row) => ({
      ...row,
      Pathway_Class_assigned: row['Pathway Class'] || 'Unknown',
      Subclass_assigned: row.Subclass || 'Unknown',
    }));

    const finalData = [...updatedOthers, ...updatedReactome];
    const endTime = Date.now();
    const processingTimeSeconds = ((endTime - startTime) / 1000).toFixed(2);

    const headers = [
      'Pathway',
      'Pathway Class',
      'Subclass',
      'Species',
      'Source',
      'URL',
      'Pathway_Class_assigned',
      'Subclass_assigned',
    ];

    const tsv =
      headers.join('\t') +
      '\n' +
      finalData
        .map((row) => headers.map((h) => (row as any)[h] ?? '').join('\t'))
        .join('\n');

    // Send final results
    res.write(
      `data: ${JSON.stringify({
        type: 'complete',
        preview: finalData,
        tsv,
        processingTime: processingTimeSeconds,
        totalPathways: finalData.length,
      })}\n\n`
    );

    res.end();
  } catch (error) {
    console.error('Unexpected API error:', error);
    res.write(
      `data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`
    );
    res.end();
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};
