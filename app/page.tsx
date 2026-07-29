import type { Metadata } from "next";
import { PostList } from "@/components/PostList";
import { pageMetadata } from "@/lib/metadata";
import { HOME_PATH, postPath } from "@/lib/paths";
import { listPublishedPosts } from "@/lib/posts";
import { POST_LIST_EMPTY_TEXT, POST_LIST_LEAD, POST_LIST_TITLE, SITE_DESCRIPTION } from "@/lib/site";

export const metadata: Metadata = pageMetadata({ description: SITE_DESCRIPTION, path: HOME_PATH });

export default function HomePage() {
  return (
    <PostList
      title={POST_LIST_TITLE}
      lead={POST_LIST_LEAD}
      posts={listPublishedPosts()}
      emptyText={POST_LIST_EMPTY_TEXT}
      postHref={(post) => postPath(post.slug)}
    />
  );
}
