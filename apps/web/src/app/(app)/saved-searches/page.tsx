import { ComingSoon } from '@/components/coming-soon';
export const metadata = { title: 'Saved Searches' };
export default function Page() {
  return <ComingSoon title="Saved Searches" phase={5} description="Save a search and its filters." points={['Until then, bookmark any search results page. All filters live in the URL.']} />;
}
