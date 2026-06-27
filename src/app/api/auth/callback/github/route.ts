import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  console.log("[OAuth Callback Alternate] Received code:", code ? `${code.slice(0, 5)}...` : "none");
  console.log("[OAuth Callback Alternate] Client ID configured:", !!clientId, "Client Secret configured:", !!clientSecret);

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code_provided', request.url));
  }

  try {
    // 1. Exchange temporary code for an access token
    console.log("[OAuth Callback Alternate] Exchanging code for token with GitHub...");
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log("[OAuth Callback Alternate] GitHub Token Exchange Response:", JSON.stringify(tokenData));

    if (tokenData.error) {
      return NextResponse.redirect(new URL(`/?error=${tokenData.error_description || tokenData.error}`, request.url));
    }

    const accessToken = tokenData.access_token;

    // 2. Query GitHub User Details
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userResponse.json();

    // 3. Query User Emails to match/create account record
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const emailsData = await emailsResponse.json();
    const primaryEmail = emailsData.find((e: any) => e.primary)?.email || userData.email;

    // 4. Update or Upsert inside Database using robust account-linking
    const prisma = getPrisma();
    let user = await prisma.user.findUnique({
      where: { githubId: userData.id }
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: primaryEmail,
          name: userData.name || userData.login,
          accessToken: accessToken,
        }
      });
    } else {
      user = await prisma.user.findUnique({
        where: { email: primaryEmail }
      });

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            githubId: userData.id,
            name: userData.name || userData.login,
            accessToken: accessToken,
          }
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: primaryEmail,
            name: userData.name || userData.login,
            githubId: userData.id,
            accessToken: accessToken,
          }
        });
      }
    }

    // 5. Store session mapping using secure HTTP-only cookie context
    const cookieStore = await cookies();
    cookieStore.set('cadlab_user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 Week
    });

    // Store GitHub token in session cookie
    cookieStore.set('cadlab_github_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24, // 1 Day
    });

    return NextResponse.redirect(new URL('/', request.url));
  } catch (err: any) {
    console.error("GitHub OAuth Callback Error:", err);
    return NextResponse.redirect(new URL(`/?error=auth_failed`, request.url));
  }
}
