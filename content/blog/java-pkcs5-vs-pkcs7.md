---
title: 仕様書は PKCS7Padding、Java は PKCS5Padding。名前が違うだけで中身は同じ
summary: 仕様書に「PKCS7Padding」とあるのに、Java のコードは「AES/CBC/PKCS5Padding」。AES でも Triple DES でも、付くパディングのバイト列は同じだった。RFC、Oracle の文書、OpenJDK のソース、実際に動かした結果で確かめて、名前が 2 つある理由と設計書での書き方をまとめた。
publishedAt: 2026-11-12T14:10:00+09:00
tags: [java, security]
---

他のシステムとやり取りする仕様書に「パディング：PKCS7Padding」と書いてあった。AES-256/CBC と Triple DES/ECB の両方だ。一方で、Java のコードは `Cipher.getInstance("AES/CBC/PKCS5Padding")` になっている。

名前が違うので、どちらかが間違っているように見える。結論から書くと、Java 標準の SunJCE では、この 2 つは同じバイト列になる。

- AES（16 バイトのブロック）でも、Triple DES（8 バイトのブロック）でも、PKCS5Padding が付けるパディングは PKCS#7 と同じ
- SunJCE に「PKCS7Padding」という名前は無い。指定すると `NoSuchAlgorithmException` になる
- 相手が本当に PKCS#7 で作ったデータなら、Java の PKCS5Padding で復号できる。逆も同じ

以下、規格・Oracle の文書・OpenJDK のソース・実際に動かした結果の順に確かめていく。

# 2 つの規格が決めていること

## PKCS#7 は「ブロック長 k」で決めている

PKCS#7 のパディングは、RFC 2315（PKCS #7 v1.5、1998 年）の 10.3 と、その後継の RFC 5652（CMS）の 6.3 にある。RFC 5652 の 6.3 から引用する。

> For such algorithms, the input shall be padded at the trailing end with k-(lth mod k) octets all having value k-(lth mod k), where lth is the length of the input.

ブロック長を k バイトとして、足りない分のバイト数を、その数を値にしたバイトで埋める。割り切れるときも、値 k のバイトを k 個（1 ブロック分）足す。こうしておけば、復号したあとに最後のバイトを見るだけで、何バイト削ればいいかが分かる。

k の範囲には条件がある。

> This padding method is well defined if and only if k is less than 256.

1 バイトで長さを表すので、k は 255 まで。AES の 16 も DES の 8 も入る。

## PKCS#5 は「8 バイト」で決めている

PKCS#5 は、パスワードから鍵を作って暗号化するための規格。いまの版は RFC 8018（PKCS #5 v2.1、2017 年）で、パディングは 6.1.1 の手順 4 にある。

> where the padding string PS consists of 8-(||M|| mod 8) octets each with value 8-(||M|| mod 8).

PKCS#7 の式の k が 8 に固定されている。この手順（PBES1）で使う暗号は DES と RC2 で、どちらもブロック長が 8 バイトなので、8 バイトのブロックしか考えていない。

つまり、8 バイトのブロックなら PKCS#5 と PKCS#7 は定義の上でも同じになる。Triple DES は 8 バイトなので、どちらの名前で呼んでも結果は変わらない。

## AES については PKCS#5 自身が PKCS#7 を指している

前の版の RFC 2898（PKCS #5 v2.0、2000 年）の付録 B.2 には、DES・Triple DES・RC2・RC5 しか載っていない。v2.1 の RFC 8018 で B.2.5 AES-CBC-Pad が足され、パディングはこう書かれている。

> with the padding operation specified in RFC 5652

PKCS#5 の規格自身が、AES のパディングは PKCS#7（RFC 5652）の方式だと言っている。厳密には、AES について「PKCS#5 のパディング」と言うのは正しくない。

# Java（SunJCE）の扱い

## 文書には PKCS5Padding しか無い

Oracle の「Java Security Standard Algorithm Names」（JDK 25）の Cipher Algorithm Paddings の表には、PKCS5Padding はこう書かれている。

> The padding scheme described in PKCS #5: Password-Based Cryptography Specification, version 2.1.

ブロック長が 16 のときにどうするかは書かれていない。PKCS7Padding という名前は、ページのどこにも無い。

「JDK Providers Documentation」の SunJCE の表でも、AES と DESede のパディングは NoPadding・PKCS5Padding・ISO10126Padding の 3 つだけ。PKCS5Padding が PKCS#7 と同じだ、という説明も見当たらなかった。

## ソースを読むと、ブロック長に合わせて動いている

文書に無いので、ソースを読んだ。JDK に付いている `lib/src.zip` に入っている。

パディングの名前を受け付けるのは `com.sun.crypto.provider.CipherCore` の `setPadding` で、通る名前は 3 つだけだ（JDK 25.0.4）。

```java
if (paddingScheme.equalsIgnoreCase("NoPadding")) {
    padding = null;
} else if (paddingScheme.equalsIgnoreCase("ISO10126Padding")) {
    padding = new ISO10126Padding(blockSize);
} else if (paddingScheme.equalsIgnoreCase("PKCS5Padding")) {
    padding = new PKCS5Padding(blockSize);
} else {
    throw new NoSuchPaddingException("Padding: " + paddingScheme
                                     + " not implemented");
}
```

`blockSize` は暗号の側から渡される。`AESCipher` は `AESConstants.AES_BLOCK_SIZE`（16）、`DESedeCipher` は `DESConstants.DES_BLOCK_SIZE`（8）で `CipherCore` を作っている。

`PKCS5Padding` クラスの中身は、PKCS#7 の式そのものだ。

```java
public int padLength(int len) {
    return blockSize - (len % blockSize);
}

public void padWithLen(byte[] in, int off, int len) throws ShortBufferException {
    // （範囲の確認は省略）
    byte paddingOctet = (byte) (len & 0xff);
    Arrays.fill(in, off, idx, paddingOctet);
}
```

復号のときの `unpad` は、最後のバイトが 1 未満か `blockSize` より大きいとき、またはパディングのバイトが全部同じ値でないときに、不正と判断する。これも PKCS#7 の決まりと同じ。

名前は PKCS#5 なのに、中身はブロック長 k で動く PKCS#7 になっている。

JDK 8／11／17／21 の `setPadding` も GitHub の openjdk/jdk8u などで読んだが、通る名前は同じ 3 つで、PKCS7Padding はどの版にも無かった。

## 動かして確かめる

PKCS5Padding で暗号化して NoPadding で復号すると、付いたパディングがそのまま見える。

```java
import java.util.Arrays;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

public class PadBytes {
    public static void main(String[] args) throws Exception {
        show("AES", 32, new int[] {0, 1, 15, 16});
        show("DESede", 24, new int[] {0, 1, 7, 8});
    }

    // PKCS5Padding で暗号化し、NoPadding で復号して、付いたパディングだけを出す
    static void show(String alg, int keyLen, int[] lengths) throws Exception {
        var key = new SecretKeySpec(new byte[keyLen], alg);
        var enc = Cipher.getInstance(alg + "/ECB/PKCS5Padding");
        var dec = Cipher.getInstance(alg + "/ECB/NoPadding");
        for (int n : lengths) {
            enc.init(Cipher.ENCRYPT_MODE, key);
            dec.init(Cipher.DECRYPT_MODE, key);
            byte[] padded = dec.doFinal(enc.doFinal(new byte[n]));
            byte[] pad = Arrays.copyOfRange(padded, n, padded.length);
            System.out.printf("%-6s len=%2d -> %s%n", alg, n, HexFormat.ofDelimiter(" ").formatHex(pad));
        }
    }
}
```

JDK 25 で `java PadBytes.java` を動かした結果がこれ。

```text
AES    len= 0 -> 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10
AES    len= 1 -> 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f
AES    len=15 -> 01
AES    len=16 -> 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10 10
DESede len= 0 -> 08 08 08 08 08 08 08 08
DESede len= 1 -> 07 07 07 07 07 07 07
DESede len= 7 -> 01
DESede len= 8 -> 08 08 08 08 08 08 08 08
```

AES は 16 バイト単位、DESede は 8 バイト単位で、どちらも PKCS#7 の式どおり。割り切れるとき（16 バイト、8 バイト）も 1 ブロック分足されている。

## OpenSSL で作った暗号文を Java で戻す

他の実装とつながるかも見ておく。OpenSSL の `enc` は既定で PKCS#7 のパディングを付ける。

```sh
K=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
IV=0f0e0d0c0b0a09080706050403020100
printf 'hello, padding' | openssl enc -aes-256-cbc -K $K -iv $IV | base64
# obsIO+Y+43FhxHl1a+78mA==
```

これを Java の PKCS5Padding で復号する。ついでに、PKCS7Padding を指定したときの例外も出しておく。

```java
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class PaddingDemo {
    public static void main(String[] args) throws Exception {
        var hex = HexFormat.of();
        var key = new SecretKeySpec(hex.parseHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"), "AES");
        var iv = new IvParameterSpec(hex.parseHex("0f0e0d0c0b0a09080706050403020100"));
        byte[] fromOpenSsl = Base64.getDecoder().decode("obsIO+Y+43FhxHl1a+78mA==");

        // OpenSSL が既定のパディングで作った暗号文を、PKCS5Padding で復号する
        var pkcs5 = Cipher.getInstance("AES/CBC/PKCS5Padding");
        pkcs5.init(Cipher.DECRYPT_MODE, key, iv);
        System.out.println("PKCS5Padding: " + new String(pkcs5.doFinal(fromOpenSsl)));

        // NoPadding で復号して、付いていたパディングをそのまま見る
        var noPad = Cipher.getInstance("AES/CBC/NoPadding");
        noPad.init(Cipher.DECRYPT_MODE, key, iv);
        System.out.println("NoPadding:    " + hex.formatHex(noPad.doFinal(fromOpenSsl)));

        // SunJCE に PKCS7Padding という名前は無い
        try {
            Cipher.getInstance("AES/CBC/PKCS7Padding");
        } catch (Exception e) {
            System.out.println(e);
        }
    }
}
```

```text
PKCS5Padding: hello, padding
NoPadding:    68656c6c6f2c2070616464696e670202
java.security.NoSuchAlgorithmException: Cannot find any provider supporting AES/CBC/PKCS7Padding
```

14 バイトの平文に `02 02` が付いていて、PKCS5Padding で問題なく戻っている。PKCS7Padding のほうは、SunJCE が受け付けないので `getInstance` の時点で落ちる。

鍵と IV は例のために決め打ちにしている。実際のコードでは、鍵は安全な場所から読み、IV は暗号化のたびに乱数で作る。

# 名前が 2 つある理由

ここまでで、中身が同じことは確かめられた。では、なぜ Java だけ名前が違うのか。

PKCS#5 は 8 バイト専用、PKCS#7 はそれを k バイトに広げたもの。Java は PKCS5Padding という名前のまま、中身をブロック長に合わせて動くようにしている。一方、OpenSSL・.NET・BouncyCastle は PKCS7 の名前を使う。結果として、同じパディングに 2 つの名前が付いている。

OpenJDK にも、この名前の食い違いを扱ったチケット [JDK-8076969「PKCS5Padding and PKCS7Padding name conventions」](https://bugs.openjdk.org/browse/JDK-8076969) がある。PKCS7Padding の名前を足す案が出ていたが、Won't Fix で閉じられている。

# 復号が合わないときに疑うところ

名前が違うだけなら困らない。困るのは、相手が「PKCS7」と書いていながら、実際には別のパディングを使っているときだ。

- ゼロで埋めている（.NET の `PaddingMode.Zeros` など）
- ANSI X9.23（`00 … 00 長さ`）や ISO 10126（`乱数 … 長さ`）を使っている
- パディングを付けていない（OpenSSL の `-nopad`、割り切れるときに 1 ブロック足さない独自の実装）

たいていは `BadPaddingException` になる。厄介なのは最後のケースで、パディングが無いのに平文の最後のバイトがたまたま `01` だと、例外にならずに 1 バイト削られる。気づかないままデータが壊れる。

逆に、鍵・IV・モードが食い違っていても、復号結果がでたらめになって同じ `BadPaddingException` が出る。パディングを疑う前に、3DES の鍵の長さ（SunJCE の DESede は 24 バイト）、IV の受け渡し、文字コード、Base64 の扱いを確かめたほうが早い。

迷ったら、相手に既知の平文で暗号文を 1 本作ってもらい、NoPadding で復号して末尾のバイトを目で見るのが確実だ。

# 設計書にはこう書くことにした

- 外部設計・基本設計：規格の名前で「PKCS#7（RFC 5652 6.3）」と書く。相手の仕様書と表記がそろう
- 注記を 1 行入れる：「Java（SunJCE）では "PKCS5Padding" を指定する。SunJCE の PKCS5Padding はブロック長に応じて PKCS#7 と同一のパディングを行う」
- 詳細設計：`getInstance` に渡す文字列（`"AES/CBC/PKCS5Padding"` など）をそのまま書く

全部を PKCS7Padding で書くと、実装する人がそのまま `getInstance` に渡して落ちる。全部を PKCS5Padding で書くと、相手の仕様書と食い違って見えるうえ、AES については規格の上で正しくない。どちらの名前も、書く層によって使い分けるのがいい。

根拠集め（RFC、Oracle の文書、ソース、実測）は AI（Claude Code）にやらせて、設計書の書き方はそれを見てこっちで決めた。名前が違うだけで中身は同じ、というのは知っていれば一言だが、根拠まで追うと案外長かった。
