/**
 * @author: Egide Ntwali
 * @description: The 404 page
 * @returns {JSX.Element} The 404 page
 */

import * as React from 'react';

import PathwaysPage from '@/component/pathways';
import Seo from '@/component/seo';

export default function HomePage() {
  return (
    <>
      <Seo templateTitle='Home' />

      <main>
        <PathwaysPage />
      </main>
    </>
  );
}
