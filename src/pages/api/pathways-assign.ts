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

// Simplified fallback classification function - minimal logic to avoid errors
function classifyPathwayFallback(pathwayName: string, species: string): {
  class: string;
  subclass: string;
} {
  const name = pathwayName.toLowerCase();
  
  // Very basic fallback - let AI handle the complex species-specific logic
  if (name.includes('metabolism') || name.includes('metabolic')) {
    return { class: 'Metabolism', subclass: 'Metabolism of proteins' };
  }
  if (name.includes('signaling') || name.includes('signal')) {
    return { class: 'Signal Transduction', subclass: 'Intracellular signaling by second messengers' };
  }
  if (name.includes('immune')) {
    return { class: 'Immune System', subclass: 'Innate Immune System' };
  }
  if (name.includes('transcription') || name.includes('rna')) {
    return { class: 'Gene expression (Transcription)', subclass: 'RNA Polymerase II Transcription' };
  }
  if (name.includes('neuron') || name.includes('synapse')) {
    return { class: 'Neuronal System', subclass: 'Transmission across Chemical Synapses' };
  }
  if (name.includes('development')) {
    return { class: 'Developmental Biology', subclass: 'Nervous system development' };
  }
  if (name.includes('cell cycle')) {
    return { class: 'Cell Cycle', subclass: 'Mitotic Cell Cycle' };
  }
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
      You are a biomedical expert classifying biological pathways using EXACT Reactome terminology. You MUST consider the SPECIES of each pathway when making classifications.

      CRITICAL REQUIREMENTS:
      - Use ONLY exact Reactome pathway names and subclasses
      - Assign BOTH class AND subclass for every pathway
      - Never use "Unknown" or "N/A" for subclasses
      - ALWAYS consider the SPECIES when classifying pathways
      - Match existing Reactome classifications when possible
      - Adapt classifications based on species complexity and evolutionary distance from human

      SPECIES-SPECIFIC CLASSIFICATION RULES:
      
      **Mammals (Homo sapiens, Mus musculus):**
      - Full pathway complexity: adaptive immunity, complex signaling, neuronal systems, extracellular matrix
      - Use standard Reactome classifications for all pathway types
      - Examples: "Adaptive Immune System", "Signaling by Receptor Tyrosine Kinases", "Transmission across Chemical Synapses"
      
      **Plants (Arabidopsis thaliana):**
      - Plant-specific pathways: photosynthesis, plant hormones, seed development, stress responses
      - NO animal systems: no immune system, no neuronal pathways, no extracellular matrix
      - Focus on: "Photosynthesis", "Plant development", "Response to hormones", "Seed development"
      - Animal-like pathways should be classified as basic metabolism or plant-specific processes
      
      **Simple Animals (Caenorhabditis elegans, Drosophila melanogaster):**
      - Basic animal systems: simple nervous system, developmental biology, basic innate immunity
      - NO adaptive immunity: no T cells, no MHC, no complex immune responses
      - Focus on: "Innate Immune System", "Nervous system development", "Axon guidance"
      - Complex vertebrate pathways should be simplified to basic animal equivalents
      
      **Single-celled Eukaryotes (Dictyostelium discoideum, Trichoplax adhaerens, Monosiga brevicollis, Saccharomyces cerevisiae):**
      - Basic eukaryote processes: metabolism, cell cycle, basic cell processes
      - NO complex systems: no immune system, no neuronal pathways, no complex signaling
      - Focus on: "Metabolism of proteins", "Metabolism of RNA", "Mitotic Cell Cycle", "Cell differentiation"
      - Complex multicellular pathways should be classified as basic metabolism
      
      **Parasites (Plasmodium falciparum):**
      - Specialized metabolism for parasitic lifestyle
      - NO complex animal systems: no immune, neuronal, or developmental pathways
      - Focus on: "Parasite-specific metabolism", "Metabolism of proteins", "Metabolism of RNA"
      
      **Photosynthetic Bacteria (Synechocystis sp.):**
      - Basic prokaryote metabolism with photosynthesis
      - NO complex systems: no signaling, immune, neuronal, or developmental pathways
      - Focus on: "Photosynthesis", "Metabolism of proteins", "Metabolism of RNA"
      
      **Bacteria (E. coli, P. aeruginosa, K. pneumoniae, M. tuberculosis, B. subtilis, S. aureus):**
      - Prokaryote metabolism only: basic metabolism, cell cycle, DNA processes
      - NO complex systems: no signaling, immune, neuronal, or developmental pathways
      - Focus on: "Metabolism of proteins", "Metabolism of RNA", "Carbohydrate metabolism"
      - Complex eukaryotic pathways should be classified as basic metabolism
      
      **Archaea (Methanocaldococcus jannaschii):**
      - Extremophile adaptations: basic metabolism, methanogenesis
      - NO complex systems: no signaling, immune, neuronal, or developmental pathways
      - Focus on: "Methanogenesis", "Metabolism of proteins", "Metabolism of RNA"

      REACTOME CLASSIFICATION HIERARCHY:
      Class (top-level) → Subclass (intermediate) → Pathway (specific)
      
      MAJOR CLASSES: Metabolism, Signal Transduction, Gene expression (Transcription), Immune System, Cell Cycle, Developmental Biology, Neuronal System, DNA Replication, DNA Repair, Cell-Cell communication, Transport of small molecules, Vesicle-mediated transport, Programmed Cell Death, Autophagy, Chromatin organization, Protein localization, Cellular responses to stimuli, Hemostasis, Muscle contraction, Organelle biogenesis and maintenance, Sensory Perception, Drug ADME, Digestion and absorption, Extracellular matrix organization

      COMMON REACTOME SUBCLASSES:
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Metabolism of amino acids and derivatives", "Carbohydrate metabolism", "Photosynthesis"
      - Signal Transduction: "Signaling by Receptor Tyrosine Kinases", "MAPK family signaling cascades", "Signaling by Rho GTPases", "Intracellular signaling by second messengers"
      - Immune System: "Adaptive Immune System", "Cytokine Signaling in Immune system", "Innate Immune System"
      - Gene Expression: "RNA Polymerase II Transcription", "Processing of Capped Intron-Containing Pre-mRNA", "mRNA Splicing"
      - Neuronal System: "Transmission across Chemical Synapses", "Neurotransmitter receptors and postsynaptic signal transmission"
      - Cell-Cell Communication: "Cell junction organization", "Adherens junctions interactions", "Gap junction trafficking"
      - Programmed Cell Death: "Apoptosis", "Necroptosis", "Autophagy"
      - Drug ADME: "Xenobiotic metabolism", "Drug metabolism", "Phase I - Functionalization of compounds"
      - Developmental Biology: "Nervous system development", "Axon guidance", "Plant development", "Cell differentiation"
      - Extracellular Matrix: "Collagen formation", "Collagen biosynthesis and modifying enzymes", "Assembly of collagen fibrils and other multimeric structures"

      CLASSIFICATION STRATEGY:
      1. First, try to match existing Reactome classifications for the pathway
      2. If no exact match, adapt the classification based on species complexity
      3. For complex pathways in simple species, simplify to basic equivalents
      4. For animal-specific pathways in plants/bacteria, use appropriate alternatives
      5. Always maintain biological accuracy for the species being classified

      RESPONSE FORMAT:
      Pathway: <pathway name>
      Species: <species name>
      Class: <exact Reactome class name>
      Subclass: <exact Reactome subclass name>

      RULES: 
      - Always assign both class and subclass
      - Consider species when choosing classifications
      - Use biological logic to choose the best fit subclass
      - Adapt classifications based on species complexity and evolutionary distance from human
      - Match existing Reactome classifications when possible
      - Simplify complex pathways for simple species appropriately
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
          const hit = (
            cacheLookup as Record<
              string,
              { class: string; subclass: string } | undefined
            >
          )[row.Pathway];
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
          content: `Classify the following pathways considering their SPECIES. You MUST provide BOTH class and subclass for every pathway - never leave subclass empty or as N/A.

                    IMPORTANT: Use the species-specific classification rules from the system prompt to adapt pathways appropriately:
                    - Match existing Reactome classifications when possible
                    - For complex pathways in simple species, simplify to basic equivalents
                    - For animal-specific pathways in plants/bacteria, use appropriate alternatives
                    - Always maintain biological accuracy for the species being classified

                    Provide results in this exact format for each pathway:

                    Pathway: <pathway name>
                    Species: <species name>
                    Class: <exact Reactome class name>
                    Subclass: <exact Reactome subclass name - REQUIRED>

                    REMEMBER: Every pathway needs both a class AND a meaningful subclass based on the species and Reactome classifications. Let the AI handle the complex species-specific logic.

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
            const speciesLine = lines.find((l) => l.startsWith('Species:')) || '';
            const classLine = lines.find((l) => l.startsWith('Class:')) || '';
            const subclassLine =
              lines.find((l) => l.startsWith('Subclass:')) || '';
            return {
              pathway: pathwayLine
                ? pathwayLine.replace('Pathway:', '').trim()
                : '',
              species: speciesLine
                ? speciesLine.replace('Species:', '').trim()
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

            // Fallback classification logic if AI returns Unknown or no match
            let classAssigned = match?.classAssigned ?? 'Unknown';
            let subclassAssigned = match?.subclassAssigned ?? 'Unknown';

            // If AI returned Unknown, try to classify based on pathway name
            if (classAssigned === 'Unknown' || subclassAssigned === 'Unknown') {
              const fallbackClassification = classifyPathwayFallback(
                row.Pathway, row.Species
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
