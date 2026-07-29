import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostDetail } from "@/components/PostDetail";
import { pageMetadata } from "@/lib/metadata";
import { HOME_PATH, postPath } from "@/lib/paths";
import { getPublishedPost, listPublishedPosts, toSlugParams } from "@/lib/posts";
import { POST_LIST_TITLE } from "@/lib/site";

// 静的出力では、ビルド時に生成していない slug を実行時に描画できない
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  // 記事が 0 件でもビルドが通るよう、0 件のときは仮の slug を 1 件返す（そのページは下で notFound() になる）
  return toSlugParams(listPublishedPosts());
}

export async function generateMetadata({ params }: PageProps<"/posts/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) notFound();
  return pageMetadata({
    title: post.title,
    description: post.summary,
    path: postPath(post.slug),
    article: { publishedTime: post.publishedAt, updatedTime: post.updatedAt },
  });
}

export default async function PostPage({ params }: PageProps<"/posts/[slug]">) {
  const { slug } = await params;
  const post = getPublishedPost(slug);
  if (!post) notFound();
  return <PostDetail post={post} listLabel={POST_LIST_TITLE} backHref={HOME_PATH} backLabel={`${POST_LIST_TITLE}へ戻る`} />;
}
