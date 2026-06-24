import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code_provided', request.url));
  }

  try {
    // 1. Exchange temporary code for an access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      return NextResponse.redirect(new URL(`/?error=${tokenData.error_description}`, request.url));
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

    // 4. Update or Upsert inside Database
    const prisma = getPrisma();
    const user = await prisma.user.upsert({
      where: { email: primaryEmail },
      update: {
        accessToken: accessToken,
        name: userData.name || userData.login,
        githubId: userData.id,
      },
      create: {
        email: primaryEmail,
        name: userData.name || userData.login,
        githubId: userData.id,
        accessToken: accessToken,
      },
    });

    // 5. Store session mapping using secure HTTP-only cookie context
    const cookieStore = await cookies();
    cookieStore.set('cadlab_user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 Week
    });

    return NextResponse.redirect(new URL('/', request.url));
  } catch (err: any) {
    return NextResponse.redirect(new URL(`/?error=auth_failed`, request.url));
  }
}
