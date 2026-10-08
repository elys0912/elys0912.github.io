import type { Metadata } from "next";
import Link from "next/link";
import { HOME_PATH } from "@/lib/paths";
import { POST_LIST_TITLE } from "@/lib/site";

export const metadata: Metadata = {
  title: "ページが見つかりません",
};

export default function NotFound() {
  return (
    <>
      <h1>ページが見つかりません</h1>
      <p>お探しのページは移動または削除された可能性があります。</p>
      <p>
        <Link href={HOME_PATH}>{POST_LIST_TITLE}へ戻る</Link>
      </p>
    </>
  );
}
