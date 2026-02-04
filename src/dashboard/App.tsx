import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { MarketsOverview } from "./pages/MarketsOverview";
import { MarketDetail } from "./pages/MarketDetail";
import { BorrowerDetail } from "./pages/BorrowerDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<MarketsOverview />} />
            <Route path="market/:marketId" element={<MarketDetail />} />
            <Route path="borrower/:address" element={<BorrowerDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
