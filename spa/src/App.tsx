import { useMemo } from "react";
import ReviewPage from "./ReviewPage";
import UploadPage from "./UploadPage";

export default function App() {
  const isReview = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return Boolean(q.get("invoiceId") && q.get("session"));
  }, []);

  return isReview ? <ReviewPage /> : <UploadPage />;
}
