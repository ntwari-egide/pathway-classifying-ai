/**
 * @author: Egide Ntwali
 * @description: The SEO component, It is used to manage the SEO of the website and the pages
 * @param {SeoProps} props The props of the SEO component
 * @param {string} date The date of the SEO component
 * @param {string} templateTitle The template title of the SEO component
 * @returns {JSX.Element} The SEO component
 */

import Head from 'next/head';
import { useRouter } from 'next/router';

const defaultMeta = {
  title: 'Pathways | AI-Powered pathways classifier',
  siteName: '',
  type: 'website',
  robots: 'follow, index',
  image:
    'https://6415593.fs1.hubspotusercontent-na1.net/hubfs/6415593/Website%20Template/Features%20Screenshots/hero-check-in-feature.webp', // Hypothetical image URL based on their branding
};

type SeoProps = {
  date?: string;
  templateTitle?: string;
} & Partial<typeof defaultMeta>;

export default function Seo(props: SeoProps) {
  const router = useRouter();
  const meta = {
    ...defaultMeta,
    ...props,
  };
  meta['title'] = props.templateTitle
    ? `${props.templateTitle} | ${meta.siteName} - AI Powered Pathway Classifier`
    : meta.title;

  return (
    <Head>
      <title>{meta.title}</title>
      <meta name='title' content='Pathways | AI Powered Pathway Classsifier' />
      {/* Description */}
      <meta
        name='description'
        content='Pathways is an advanced AI-powered pathway classifier providing expert legal guidance, document review, and legal insights. Our platform uses cutting-edge artificial intelligence to offer accurate legal support and streamline legal research for individuals and businesses.'
      />
      {/* Keywords */}
      <meta
        name='keywords'
        content='Pathways, AI-powered pathway classifier, legal guidance, legal document review, legal technology, legal insights, AI legal assistant, legal research, legal support platform, expert legal solutions, AI law, legal tech, legal automation, legal AI tools'
      />
      {/* Author */}
      <meta name='author' content='Egide Ntwari' />
      <meta name='robots' content={meta.robots} />
      {/* Open Graph */}
      <meta property='og:type' content={meta.type} />
      <meta property='og:site_name' content={meta.siteName} />
      <meta property='og:title' content={meta.title} />
      <meta name='image' property='og:image' content={meta.image} />
      {/* Twitter */}
      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:title' content={meta.title} />
      <meta name='twitter:image' content={meta.image} />
      {meta.date && (
        <>
          <meta property='article:published_time' content={meta.date} />
          <meta
            name='publish_date'
            property='og:publish_date'
            content={meta.date}
          />
          <meta
            name='author'
            property='article:author'
            content='Egide Ntwari'
          />
        </>
      )}

      {/* Favicons */}
      {favicons.map((linkProps) => (
        <link key={linkProps.href} {...linkProps} />
      ))}
      <meta name='msapplication-TileColor' content='#ffffff' />
      <meta name='msapplication-config' content='/favicon/browserconfig.xml' />
      <meta name='theme-color' content='#ffffff' />
    </Head>
  );
}

const favicons: Array<React.ComponentPropsWithoutRef<'link'>> = [
  {
    rel: 'apple-touch-icon',
    sizes: '180x180',
    href: '/favicon/apple-touch-icon.png',
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '32x32',
    href: '/favicon/favicon-32x32.png',
  },
  {
    rel: 'icon',
    type: 'image/png',
    sizes: '16x16',
    href: '/favicon/favicon-16x16.png',
  },
  { rel: 'manifest', href: '/favicon/site.webmanifest' },
  {
    rel: 'mask-icon',
    href: '/favicon/safari-pinned-tab.svg',
    color: '#00e887',
  },
  { rel: 'shortcut icon', href: '/favicon/favicon.ico' },
];
