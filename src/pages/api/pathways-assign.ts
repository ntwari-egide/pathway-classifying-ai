import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

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
  'UniProt IDS': string;
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

    const data: PathwayRow[] = req.body.pathways;

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
      You are a biomedical expert specialized in classifying human biological pathways. Your task is to assign each pathway a "Pathway Class" and a "Subclass" based on EXACT Reactome hierarchical classification patterns.

      CRITICAL REQUIREMENT: 
      You MUST use ONLY the exact pathway names found in the Reactome database. Do NOT create new names or variations.

      HIERARCHICAL UNDERSTANDING:
      In Reactome, pathways have a parent-child hierarchy:
      - Class = Top-level parent pathway (e.g., "Metabolism", "Signal Transduction")
      - Subclass = Intermediate parent pathway (e.g., "Metabolism of proteins", "MAPK family signaling cascades")
      - Pathway = The specific pathway being classified

      CLASSIFICATION APPROACH:
      You MUST classify EVERY pathway with BOTH class AND subclass. Do NOT use "Unknown" or "N/A" for subclasses.

      EXACT REACTOME PATHWAY NAMES (use these EXACT names only):
      
      **Major Pathways (Class Level):**
      - Metabolism
      - Signal Transduction  
      - Gene expression (Transcription)
      - Immune System
      - Cell Cycle
      - Developmental Biology
      - Neuronal System
      - DNA Replication
      - DNA Repair
      - Cell-Cell communication
      - Transport of small molecules
      - Vesicle-mediated transport
      - Programmed Cell Death
      - Autophagy
      - Chromatin organization
      - Protein localization
      - Cellular responses to stimuli
      - Hemostasis
      - Muscle contraction
      - Organelle biogenesis and maintenance
      - Sensory Perception
      - Drug ADME
      - Digestion and absorption
      - Extracellular matrix organization
      
      **Specific Pathway Names (from Reactome database):**
      - Metabolism of RNA
      - Metabolism of proteins
      - Metabolism of amino acids and derivatives
      - Processing of Capped Intron-Containing Pre-mRNA
      - mRNA Splicing
      - mRNA Splicing - Major Pathway
      - Adaptive Immune System
      - Cytokine Signaling in Immune system
      - TCR signaling
      - Downstream TCR signaling
      - Phosphorylation of CD3 and TCR zeta chains
      - Translocation of ZAP-70 to Immunological synapse
      - Generation of second messenger molecules
      - MHC class II antigen presentation
      - Class I MHC mediated antigen processing & presentation
      - Antigen processing: Ubiquitination & Proteasome degradation
      - ISG15 antiviral mechanism
      - Antiviral mechanism by IFN-stimulated genes
      - Regulation of T cell activation by CD28 family
      - Co-inhibition by PD-1
      - Collagen formation
      - Collagen biosynthesis and modifying enzymes
      - Collagen chain trimerization
      - Serine metabolism
      - Signaling by ERBB4
      - Downregulation of ERBB4 signaling
      - PIP3 activates AKT signaling
      - Signaling by TGF-beta Receptor Complex
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

      EXAMPLES FROM REACTOME:
      ${examples
        .map(
          (e) =>
            `Pathway: ${e.pathway}\nClass: ${e.class}\nSubclass: ${e.subclass}`
        )
        .join('\n\n')}

      CLASSIFICATION RULES:
      1. **ALWAYS ASSIGN BOTH**: Every pathway MUST have both a Class AND Subclass - never use "N/A" or "Unknown" for subclass
      2. **HIERARCHICAL THINKING**: Class = top-level, Subclass = intermediate parent in the biological hierarchy
      3. **EXACT MATCH ONLY**: Use ONLY the exact pathway names from the Reactome list above
      4. **BIOLOGICAL LOGIC**: Match based on the biological process and system involved
      5. **NO EMPTY SUBCLASSES**: If uncertain, choose the most relevant subclass from the hierarchy

      MANDATORY SUBCLASS ASSIGNMENT:
      - For metabolism pathways: Use "Metabolism of proteins", "Metabolism of RNA", or "Xenobiotic metabolism"
      - For signaling pathways: Use "Signaling by Receptor Tyrosine Kinases", "MAPK family signaling cascades", etc.
      - For immune pathways: Use "Adaptive Immune System", "Cytokine Signaling in Immune system", etc.
      - For cell communication: Use "Adherens junctions interactions", "Cell junction organization", etc.
      - For death pathways: Use "Apoptosis", "Necroptosis", etc.

      RESPONSE FORMAT (BOTH required):
      Pathway: <pathway name>
      Class: <exact Reactome class name>
      Subclass: <exact Reactome subclass name - NEVER N/A>

      CRITICAL: Every pathway MUST have a meaningful subclass assignment. Use biological knowledge to choose the best fit.
    `;

    const messages: Message[] = [{ role: 'system', content: systemPrompt }];

    const reactomeRows = data.filter((r) => r.Source === 'Reactome');
    const others = data.filter((r) => r.Source !== 'Reactome');

    const batchSize = 20;
    const batches = batchArray(others, batchSize);

    const updatedOthers: (PathwayRow & {
      Pathway_Class_assigned: string;
      Subclass_assigned: string;
    })[] = [];

    for (const batch of batches) {
      const batchPrompt = batch.map((r) => `Pathway: ${r.Pathway}`).join('\n');

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
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          temperature: 0.3,
          messages: [...messages, userPrompt],
        });

        const text = response.choices[0].message?.content ?? '';
        console.log(`Batch classification response:\n${text}`);

        const classifications = text.split('\n\n').map((block) => {
          const lines = block.trim().split('\n');
          const pathwayLine = lines.find((l) => l.startsWith('Pathway:')) || '';
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

        batch.forEach((row) => {
          const match = classifications.find((c) => c.pathway === row.Pathway);

          // Fallback classification logic if AI returns Unknown or no match
          let classAssigned = match?.classAssigned ?? 'Unknown';
          let subclassAssigned = match?.subclassAssigned ?? 'Unknown';

          // If AI returned Unknown, try to classify based on pathway name
          if (classAssigned === 'Unknown' || subclassAssigned === 'Unknown') {
            const fallbackClassification = classifyPathwayFallback(row.Pathway);
            classAssigned =
              classAssigned === 'Unknown'
                ? fallbackClassification.class
                : classAssigned;
            subclassAssigned =
              subclassAssigned === 'Unknown'
                ? fallbackClassification.subclass
                : subclassAssigned;
          }

          updatedOthers.push({
            ...row,
            Pathway_Class_assigned: classAssigned,
            Subclass_assigned: subclassAssigned,
          });
        });
      } catch (err) {
        console.error('OpenAI batch error:', err);
        batch.forEach((row) => {
          updatedOthers.push({
            ...row,
            Pathway_Class_assigned: 'Unknown',
            Subclass_assigned: 'Unknown',
          });
        });
      }
    }

    const updatedReactome = reactomeRows.map((row) => ({
      ...row,
      Pathway_Class_assigned: row['Pathway Class'] || 'Unknown',
      Subclass_assigned: row.Subclass || 'Unknown',
    }));

    const finalData = [...updatedOthers, ...updatedReactome];

    const headers = [
      'Pathway',
      'Pathway Class',
      'Subclass',
      'Species',
      'Source',
      'URL',
      'UniProt IDS',
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
