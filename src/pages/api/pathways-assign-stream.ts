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

// Simplified fallback classification function - minimal logic to avoid errors
function classifyPathwayFallback(
  pathwayName: string,
  species: string
): {
  class: string;
  subclass: string;
} {
  const name = pathwayName.toLowerCase();

  // Very basic fallback - let AI handle the complex species-specific logic
  if (name.includes('metabolism') || name.includes('metabolic')) {
    return { class: 'Metabolism', subclass: 'Metabolism of proteins' };
  }
  if (name.includes('signaling') || name.includes('signal')) {
    return {
      class: 'Signal Transduction',
      subclass: 'Intracellular signaling by second messengers',
    };
  }
  if (name.includes('immune')) {
    return { class: 'Immune System', subclass: 'Innate Immune System' };
  }
  if (name.includes('transcription') || name.includes('rna')) {
    return {
      class: 'Gene expression (Transcription)',
      subclass: 'RNA Polymerase II Transcription',
    };
  }
  if (name.includes('neuron') || name.includes('synapse')) {
    return {
      class: 'Neuronal System',
      subclass: 'Transmission across Chemical Synapses',
    };
  }
  if (name.includes('development')) {
    return {
      class: 'Developmental Biology',
      subclass: 'Nervous system development',
    };
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
      You are a biomedical expert classifying biological pathways using EXACT Reactome terminology. You MUST consider the SPECIES of each pathway when making classifications.

      REQUIREMENTS:
      - Use ONLY exact Reactome pathway names
      - Assign BOTH class AND subclass for every pathway
      - When you are not sure about the subclass, use "Unclassified Pathway" as the subclass and "Unclassified Pathway" as the class
      - ALWAYS consider the SPECIES when classifying pathways
      - Different species may have different pathway classifications due to evolutionary differences

      SPECIES-SPECIFIC CONSIDERATIONS:
      - Human (Homo sapiens): Standard Reactome classifications, most comprehensive, full pathway complexity
      - Mouse (Mus musculus): Similar to human, full pathway complexity, mammalian systems
      - Arabidopsis thaliana (Plant): Plant-specific pathways, photosynthesis, plant hormones, no animal systems
      - Caenorhabditis elegans (Nematode): Simple nervous system, developmental biology, basic animal systems
      - Drosophila melanogaster (Fruit fly): Developmental biology, innate immunity only, no adaptive immunity
      - Dictyostelium discoideum (Amoeba): Simple eukaryote, basic metabolism, developmental processes
      - Trichoplax adhaerens (Placozoa): Simple animal, basic cell processes, no complex systems
      - Monosiga brevicollis (Choanoflagellate): Single-celled eukaryote, basic metabolism, no complex systems
      - Saccharomyces cerevisiae (Yeast): Simple eukaryote, basic metabolism and cell cycle, no complex systems
      - Plasmodium falciparum (Parasite): Apicomplexan parasite, specialized metabolism, no complex animal systems
      - Synechocystis sp. (Cyanobacteria): Photosynthetic bacteria, basic metabolism, no complex systems
      - Escherichia coli (Bacteria): Prokaryote, basic metabolism, no complex signaling or immune systems
      - Pseudomonas aeruginosa (Bacteria): Prokaryote, basic metabolism, no complex systems
      - Klebsiella pneumoniae (Bacteria): Prokaryote, basic metabolism, no complex systems
      - Mycobacterium tuberculosis (Bacteria): Prokaryote, specialized metabolism, no complex systems
      - Bacillus subtilis (Bacteria): Prokaryote, basic metabolism, no complex systems
      - Staphylococcus aureus (Bacteria): Prokaryote, basic metabolism, no complex systems
      - Methanocaldococcus jannaschii (Archaea): Extremophile archaea, basic metabolism, no complex systems

      HIERARCHY: Class (top-level) → Subclass (intermediate) → Pathway (specific)

      MAJOR CLASSES: Metabolism, Signal Transduction, Gene expression (Transcription), Immune System, Cell Cycle, Developmental Biology, Neuronal System, DNA Replication, DNA Repair, Cell-Cell communication, Transport of small molecules, Vesicle-mediated transport, Programmed Cell Death, Autophagy, Chromatin organization, Protein localization, Cellular responses to stimuli, Hemostasis, Muscle contraction, Organelle biogenesis and maintenance, Sensory Perception, Drug ADME, Digestion and absorption, Extracellular matrix organization

      SPECIES-ADAPTED SUBCLASSES:
      
      **Homo sapiens & Mus musculus (Mammals):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Metabolism of amino acids and derivatives"
      - Signal Transduction: "Signaling by Receptor Tyrosine Kinases", "MAPK family signaling cascades", "Signaling by Rho GTPases"
      - Immune System: "Adaptive Immune System", "Cytokine Signaling in Immune system", "Innate Immune System"
      - Neuronal System: "Transmission across Chemical Synapses", "Neurotransmitter receptors and postsynaptic signal transmission"
      
      **Arabidopsis thaliana (Plant):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Photosynthesis", "Plant hormone metabolism"
      - Developmental Biology: "Plant development", "Response to hormones", "Seed development"
      - No immune system or neuronal pathways (different stress responses)
      
      **Caenorhabditis elegans (Nematode):**
      - Developmental Biology: "Nervous system development", "Axon guidance", "Embryonic development"
      - Neuronal System: "Transmission across Chemical Synapses" (simple nervous system)
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA"
      - No complex immune system (basic innate responses)
      
      **Drosophila melanogaster (Fruit fly):**
      - Developmental Biology: "Nervous system development", "Axon guidance", "Pattern formation"
      - Immune System: "Innate Immune System", "Antimicrobial response" (no adaptive immunity)
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA"
      - No complex adaptive immune pathways
      
      **Dictyostelium discoideum (Amoeba):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Carbohydrate metabolism"
      - Developmental Biology: "Cell differentiation", "Multicellular development"
      - No complex immune or neuronal systems
      
      **Trichoplax adhaerens (Placozoa):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA"
      - Basic cell processes, no complex systems
      - No immune, neuronal, or developmental pathways
      
      **Monosiga brevicollis (Choanoflagellate):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA"
      - Single-celled organism, no multicellular systems
      - No complex immune, neuronal, or developmental pathways
      
      **Saccharomyces cerevisiae (Yeast):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Carbohydrate metabolism"
      - Cell Cycle: "Mitotic Cell Cycle", "Cell cycle checkpoints"
      - No complex immune system or neuronal pathways
      
      **Plasmodium falciparum (Parasite):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Parasite-specific metabolism"
      - No complex immune, neuronal, or developmental pathways
      - Specialized for parasitic lifestyle
      
      **Synechocystis sp. (Cyanobacteria):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Photosynthesis"
      - No complex systems, basic prokaryote metabolism
      
      **Escherichia coli, Pseudomonas aeruginosa, Klebsiella pneumoniae, Mycobacterium tuberculosis, Bacillus subtilis, Staphylococcus aureus (Bacteria):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Carbohydrate metabolism"
      - No complex signaling, immune system, or neuronal pathways
      - Basic cell cycle and DNA processes
      
      **Methanocaldococcus jannaschii (Archaea):**
      - Metabolism: "Metabolism of proteins", "Metabolism of RNA", "Methanogenesis"
      - Extremophile adaptations, no complex systems

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
      - Mammals have full pathway complexity, plants have plant-specific pathways, bacteria/archaea have basic metabolism only
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
          content: `Classify the following pathways considering their SPECIES. You MUST provide BOTH class and subclass for each pathway - never leave subclass empty or as N/A.

          IMPORTANT: Consider the species when classifying. Different species have different pathway complexities:
          - Mammals (Homo sapiens, Mus musculus): Full pathway complexity including adaptive immunity, complex signaling, and neuronal systems
          - Plants (Arabidopsis thaliana): Plant-specific pathways including photosynthesis, no animal systems
          - Nematodes (Caenorhabditis elegans): Simple nervous system, basic animal systems, no complex immunity
          - Insects (Drosophila melanogaster): Developmental biology, innate immunity only, no adaptive immunity
          - Amoeba (Dictyostelium discoideum): Simple eukaryote, basic metabolism, developmental processes
          - Placozoa (Trichoplax adhaerens): Simple animal, basic cell processes, no complex systems
          - Choanoflagellates (Monosiga brevicollis): Single-celled eukaryote, basic metabolism, no complex systems
          - Yeast (Saccharomyces cerevisiae): Basic eukaryote, no complex systems
          - Parasites (Plasmodium falciparum): Specialized metabolism, no complex animal systems
          - Cyanobacteria (Synechocystis sp.): Photosynthetic bacteria, basic metabolism, no complex systems
          - Bacteria (E. coli, P. aeruginosa, K. pneumoniae, M. tuberculosis, B. subtilis, S. aureus): Prokaryotes, basic metabolism only, no complex systems
          - Archaea (Methanocaldococcus jannaschii): Extremophile, basic metabolism, no complex systems

          Provide results in this exact format for each pathway:

          Pathway: <pathway name>
          Species: <species name>
          Class: <exact Reactome class name>
          Subclass: <exact Reactome subclass name - REQUIRED>

          REMEMBER: Every pathway needs both a class AND a meaningful subclass based on the species and hierarchical examples provided.

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
            const speciesLine =
              lines.find((l) => l.startsWith('Species:')) || '';
            const classLine = lines.find((l) => l.startsWith('Class:')) || '';
            const subclassLine =
              lines.find((l) => l.startsWith('Subclass:')) || '';
            return {
              pathway: pathwayLine
                ? pathwayLine.replace('Pathway:', '').trim()
                : '',
              species: speciesLine
                ? speciesLine.replace('Species:', '').trim() || 'Unknown'
                : 'Unknown',
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
                row.Pathway,
                row.Species
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
