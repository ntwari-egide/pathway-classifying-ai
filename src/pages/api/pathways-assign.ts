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

// Persistent + in-memory cache handled in '@/lib/cache'

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

  // Immune system patterns (using exact Reactome names with specific subclasses)
  if (
    name.includes('immune') ||
    name.includes('inflammatory') ||
    name.includes('tcr') ||
    name.includes('mhc') ||
    name.includes('viral') ||
    name.includes('myocarditis')
  ) {
    if (
      name.includes('adaptive') ||
      name.includes('tcr') ||
      name.includes('t cell')
    ) {
      return { class: 'Immune System', subclass: 'Adaptive Immune System' };
    }
    if (
      name.includes('cytokine') ||
      name.includes('interferon') ||
      name.includes('viral') ||
      name.includes('myocarditis')
    ) {
      return {
        class: 'Immune System',
        subclass: 'Cytokine Signaling in Immune system',
      };
    }
    if (name.includes('mhc') || name.includes('antigen')) {
      return {
        class: 'Immune System',
        subclass: 'MHC class II antigen presentation',
      };
    }
    return {
      class: 'Immune System',
      subclass: 'Cytokine Signaling in Immune system',
    };
  }

  // Gene expression patterns (using exact Reactome names)
  if (
    name.includes('transcription') ||
    name.includes('rna polymerase') ||
    name.includes('gene expression')
  ) {
    if (name.includes('rna polymerase') || name.includes('pol ii')) {
      return {
        class: 'Gene expression (Transcription)',
        subclass: 'RNA Polymerase II Transcription',
      };
    }
    if (
      name.includes('splicing') ||
      name.includes('mrna') ||
      name.includes('intron')
    ) {
      return {
        class: 'Gene expression (Transcription)',
        subclass: 'Processing of Capped Intron-Containing Pre-mRNA',
      };
    }
    return {
      class: 'Gene expression (Transcription)',
      subclass: 'Generic Transcription Pathway',
    };
  }

  // Neuronal/Sensory patterns (using exact Reactome names)
  if (
    name.includes('neural') ||
    name.includes('neuron') ||
    name.includes('synapse') ||
    name.includes('neurotransmitter') ||
    name.includes('adhd') ||
    name.includes('autism')
  ) {
    if (
      name.includes('neurotransmitter') ||
      name.includes('synapse') ||
      name.includes('postsynaptic')
    ) {
      return {
        class: 'Neuronal System',
        subclass:
          'Neurotransmitter receptors and postsynaptic signal transmission',
      };
    }
    if (name.includes('transmission') || name.includes('chemical synapse')) {
      return {
        class: 'Neuronal System',
        subclass: 'Transmission across Chemical Synapses',
      };
    }
    return {
      class: 'Neuronal System',
      subclass: 'Transmission across Chemical Synapses',
    };
  }

  // Visual/Sensory patterns (using exact Reactome names)
  if (
    name.includes('visual') ||
    name.includes('photo') ||
    name.includes('vision') ||
    name.includes('retina')
  ) {
    return {
      class: 'Sensory Perception',
      subclass: 'Visual phototransduction',
    };
  }

  // Developmental patterns (using exact Reactome names)
  if (
    name.includes('development') ||
    name.includes('developmental') ||
    name.includes('axon') ||
    name.includes('guidance')
  ) {
    if (name.includes('nervous') || name.includes('neural development')) {
      return {
        class: 'Developmental Biology',
        subclass: 'Nervous system development',
      };
    }
    if (name.includes('axon') || name.includes('guidance')) {
      return { class: 'Developmental Biology', subclass: 'Axon guidance' };
    }
    return {
      class: 'Developmental Biology',
      subclass: 'Nervous system development',
    };
  }

  // Cell communication patterns (using exact Reactome names)
  if (
    name.includes('cell-cell') ||
    name.includes('communication') ||
    name.includes('adhesion') ||
    name.includes('junction') ||
    name.includes('adherens')
  ) {
    if (name.includes('nephrin') || name.includes('kidney')) {
      return {
        class: 'Cell-Cell communication',
        subclass: 'Nephrin family interactions',
      };
    }
    if (name.includes('semaphorin') || name.includes('sema')) {
      return {
        class: 'Cell-Cell communication',
        subclass: 'Semaphorin interactions',
      };
    }
    if (name.includes('adherens') || name.includes('junction')) {
      return {
        class: 'Cell-Cell communication',
        subclass: 'Adherens junctions interactions',
      };
    }
    return {
      class: 'Cell-Cell communication',
      subclass: 'Cell junction organization',
    };
  }

  // Extracellular matrix patterns (using exact Reactome names)
  if (
    name.includes('collagen') ||
    name.includes('matrix') ||
    name.includes('extracellular')
  ) {
    if (name.includes('collagen formation') || name.includes('biosynthesis')) {
      return {
        class: 'Extracellular matrix organization',
        subclass: 'Collagen formation',
      };
    }
    return {
      class: 'Extracellular matrix organization',
      subclass: 'Collagen biosynthesis and modifying enzymes',
    };
  }

  // Transport patterns (using exact Reactome names)
  if (
    name.includes('transport') ||
    name.includes('channel') ||
    name.includes('transporter')
  ) {
    return {
      class: 'Transport of small molecules',
      subclass: 'Stimuli-sensing channels',
    };
  }

  // Cell death patterns (using exact Reactome names with proper subclasses)
  if (
    name.includes('apoptosis') ||
    name.includes('cell death') ||
    name.includes('programmed death') ||
    name.includes('leukemia') ||
    name.includes('cancer')
  ) {
    if (name.includes('apoptosis') || name.includes('leukemia')) {
      return { class: 'Programmed Cell Death', subclass: 'Apoptosis' };
    }
    return { class: 'Programmed Cell Death', subclass: 'Apoptosis' };
  }

  // Drug/Toxicology patterns (using exact Reactome names)
  if (name.includes('drug') || name.includes('toxic')) {
    return { class: 'Drug ADME', subclass: 'Xenobiotic metabolism' };
  }

  // DNA patterns (using exact Reactome names)
  if (name.includes('dna repair') || name.includes('repair')) {
    return { class: 'DNA Repair', subclass: 'Base Excision Repair' };
  }
  if (name.includes('dna replication') || name.includes('replication')) {
    return { class: 'DNA Replication', subclass: 'Synthesis of DNA' };
  }

  // Default fallback (using exact Reactome names)
  return { class: 'Metabolism', subclass: 'Metabolism of proteins' };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const startTime = Date.now();
    const data: PathwayRow[] = req.body.pathways;
    const resetCache = req.body.resetCache || false; // New parameter to reset cache

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty pathways data' });
    }

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
      - Downregulation of SMAD2/3:SMAD4 transcriptional activity
      - Stimuli-sensing channels
      - PTEN Regulation
      - RNA Polymerase II Transcription
      - Signaling by Rho GTPases
      - RHO GTPase cycle
      - RAC1 GTPase cycle
      - Signaling by Rho GTPases, Miro GTPases and RHOBTB3
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

      HIERARCHICAL CLASSIFICATION MAPPING (Class → Subclass → Pathway):
      
      **Metabolism Hierarchy:**
      - Class: "Metabolism"
      - Subclasses: "Metabolism of proteins", "Metabolism of RNA", "Metabolism of amino acids and derivatives"
      - Example: Acrylamide biotransformation → Class: "Drug ADME", Subclass: "Xenobiotic metabolism"
      
      **Signal Transduction Hierarchy:**
      - Class: "Signal Transduction"
      - Subclasses: "Signaling by Receptor Tyrosine Kinases", "MAPK family signaling cascades", "Signaling by Rho GTPases", "Intracellular signaling by second messengers"
      - Example: Adipocytokine signaling → Class: "Signal Transduction", Subclass: "Signaling by Receptor Tyrosine Kinases"
      
      **Immune System Hierarchy:**
      - Class: "Immune System"
      - Subclasses: "Adaptive Immune System", "Cytokine Signaling in Immune system", "Innate Immune System"
      - Example: Acute viral myocarditis → Class: "Immune System", Subclass: "Cytokine Signaling in Immune system"
      
      **Gene Expression Hierarchy:**
      - Class: "Gene expression (Transcription)"
      - Subclasses: "RNA Polymerase II Transcription", "Processing of Capped Intron-Containing Pre-mRNA", "mRNA Splicing"
      
      **Neuronal System Hierarchy:**
      - Class: "Neuronal System"
      - Subclasses: "Transmission across Chemical Synapses", "Neurotransmitter receptors and postsynaptic signal transmission"
      - Example: ADHD pathways → Class: "Neuronal System", Subclass: "Transmission across Chemical Synapses"
      
      **Cell-Cell Communication Hierarchy:**
      - Class: "Cell-Cell communication"
      - Subclasses: "Cell junction organization", "Adherens junctions interactions", "Gap junction trafficking"
      - Example: Adherens junction → Class: "Cell-Cell communication", Subclass: "Adherens junctions interactions"
      
      **Programmed Cell Death Hierarchy:**
      - Class: "Programmed Cell Death"
      - Subclasses: "Apoptosis", "Necroptosis", "Autophagy"
      - Example: Acute myeloid leukemia → Class: "Programmed Cell Death", Subclass: "Apoptosis"
      
      **Drug ADME Hierarchy:**
      - Class: "Drug ADME"
      - Subclasses: "Xenobiotic metabolism", "Drug metabolism", "Phase I - Functionalization of compounds"
      
      **Developmental Biology Hierarchy:**
      - Class: "Developmental Biology"
      - Subclasses: "Nervous system development", "Axon guidance", "Semaphorin interactions"
      
      **Extracellular Matrix Hierarchy:**
      - Class: "Extracellular matrix organization"
      - Subclasses: "Collagen formation", "Collagen biosynthesis and modifying enzymes", "Assembly of collagen fibrils and other multimeric structures"

      EXAMPLES:
      ${examples
        .map(
          (e) =>
            `Pathway: ${e.pathway}\nClass: ${e.class}\nSubclass: ${e.subclass}`
        )
        .join('\n\n')}

      RESPONSE FORMAT:
      Pathway: <pathway name>
      Class: <exact Reactome class name>
      Subclass: <exact Reactome subclass name>

      RULES: Always assign both class and subclass. Use biological logic to choose the best fit subclass.
    `;

    const messages: Message[] = [{ role: 'system', content: systemPrompt }];

    const reactomeRows = data.filter((r) => r.Source === 'Reactome');
    const others = data.filter((r) => r.Source !== 'Reactome');

    // Reset cache if requested (only clear in-memory; bypass reads below)
    if (resetCache) {
      classificationCache.clearMemory();
      console.log('In-memory cache cleared for fresh classification');
    }

    const batchSize = 100; // Increased batch size for better efficiency
    const batches = batchArray(others, batchSize);

    // Process batches in parallel with concurrency limit
    const concurrencyLimit = 5; // Process 5 batches simultaneously
    const updatedOthers: (PathwayRow & {
      Pathway_Class_assigned: string;
      Subclass_assigned: string;
    })[] = [];

    // Process batches in chunks to avoid overwhelming the API
    let processedCount = 0;
    const totalPathways = others.length;

    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const batchChunk = batches.slice(i, i + concurrencyLimit);

      console.log(
        `Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(
          batches.length / concurrencyLimit
        )} (${processedCount}/${totalPathways} pathways processed)`
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
          const hit = (cacheLookup as Record<string, { class: string; subclass: string } | undefined>)[row.Pathway];
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
          return batch.map((row) => {
            const cached = cachedResults.find((c) => c.pathway === row.Pathway)!;
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
          console.log(`Processing batch of ${batch.length} pathways...`);

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
              break; // Success, exit retry loop
            } catch (apiError: any) {
              retries--;
              console.error(
                `API call failed, retries left: ${retries}`,
                apiError.message
              );
              if (retries === 0) {
                throw apiError; // Re-throw if all retries exhausted
              }
              // Wait before retrying (exponential backoff)
              await new Promise((resolve) =>
                setTimeout(resolve, (3 - retries) * 1000)
              );
            }
          }

          const text = response!.choices[0].message?.content ?? '';
          console.log(`Batch classification response:\n${text}`);

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

          // Cache the new classifications (persist to Redis)
          await classificationCache.setMany(
            classifications
              .filter(
                (c) => c.pathway && c.classAssigned && c.classAssigned !== 'Unknown'
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

            // Fallback classification logic if AI returns Unknown or no match
            let classAssigned = match?.classAssigned ?? 'Unknown';
            let subclassAssigned = match?.subclassAssigned ?? 'Unknown';

            // If AI returned Unknown, try to classify based on pathway name
            if (classAssigned === 'Unknown' || subclassAssigned === 'Unknown') {
              const fallbackClassification = classifyPathwayFallback(row.Pathway);
              classAssigned =
                classAssigned === 'Unknown' ? fallbackClassification.class : classAssigned;
              subclassAssigned =
                subclassAssigned === 'Unknown' ? fallbackClassification.subclass : subclassAssigned;
            }

            // Cache fallback results too
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

      // Wait for all batches in this chunk to complete
      const batchResults = await Promise.all(batchPromises);

      // Flatten results and add to updatedOthers
      batchResults.forEach((result) => {
        updatedOthers.push(...result);
        processedCount += result.length;
      });

      console.log(
        `Completed batch ${
          Math.floor(i / concurrencyLimit) + 1
        }. Total processed: ${processedCount}/${totalPathways}`
      );
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

    return res.status(200).json({
      preview: finalData, // Return all data for proper pagination
      tsv,
      processingTime: processingTimeSeconds,
      totalPathways: finalData.length,
    });
  } catch (error) {
    console.error('Unexpected API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};
