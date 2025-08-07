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
      You are a biomedical expert specialized in classifying human biological pathways. Your task is to assign each pathway a "Pathway Class" and a "Subclass" based on trusted, manually curated examples from the Reactome database.

      Key points:
      - Only Reactome pathways have reliable, manually assigned classes and subclasses.
      - KEGG pathways often have incorrect class assignments, so reclassify them using patterns learned from Reactome.
      - WikiPathways have empty or "None" class/subclass fields, so assign new classes similarly.
      - Use the pathway title and your knowledge of Reactome classifications to infer appropriate classes for KEGG and WikiPathways.
      - Do NOT simply copy classes from Reactome pathways; instead, infer the most relevant classes based on the pathway title and known Reactome patterns.
      - If the pathway does not clearly fit any known class or subclass, respond with "Unknown".

      Here are some examples from Reactome (manually curated):
      ${examples
        .map(
          (e) =>
            `Pathway: ${e.pathway}\nClass: ${e.class}\nSubclass: ${e.subclass}`
        )
        .join('\n\n')}

      Instructions:
      Given a pathway name, respond exactly in this format:

      Class: <your best guess>
      Subclass: <your best guess>

      Only output the classification in this exact format without extra commentary or explanation.
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
        content: `Classify the following pathways. Provide results in this exact format for each pathway:

Pathway: <pathway name>
Class: <your best guess>
Subclass: <your best guess>

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
          const pathwayLine = lines.find((l) => l.startsWith('Pathway:')) ?? '';
          const classLine = lines.find((l) => l.startsWith('Class:')) ?? '';
          const subclassLine =
            lines.find((l) => l.startsWith('Subclass:')) ?? '';
          return {
            pathway: pathwayLine.replace('Pathway:', '').trim(),
            classAssigned: classLine.replace('Class:', '').trim() || 'Unknown',
            subclassAssigned:
              subclassLine.replace('Subclass:', '').trim() || 'Unknown',
          };
        });

        batch.forEach((row) => {
          const match = classifications.find((c) => c.pathway === row.Pathway);
          updatedOthers.push({
            ...row,
            Pathway_Class_assigned: match?.classAssigned ?? 'Unknown',
            Subclass_assigned: match?.subclassAssigned ?? 'Unknown',
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
      preview: finalData.slice(0, 10),
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
