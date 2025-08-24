export async function GET(request) {
  console.log('Simple test handler called');
  console.log('Method: GET');
  console.log('Headers:', Object.fromEntries(request.headers));
  
  return Response.json({
    message: 'Simple test successful - App Router',
    method: 'GET',
    timestamp: new Date().toISOString()
  });
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  
  console.log('Simple test handler called');
  console.log('Method: POST');
  console.log('Headers:', Object.fromEntries(request.headers));
  console.log('Body:', body);
  
  return Response.json({
    message: 'Simple test successful - App Router',
    method: 'POST',
    timestamp: new Date().toISOString(),
    receivedBody: body
  });
}