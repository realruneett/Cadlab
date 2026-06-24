import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Missing GITHUB_CLIENT_ID environment variable" }, { status: 500 });
  }

  // Requesting full 'repo' scope to give the parser access to private hardware files
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user:email`;
  
  return NextResponse.redirect(githubAuthUrl);
}
