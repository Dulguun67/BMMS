// CloudFront Function (cloudfront-js-2.0), default behavior-ийн viewer-request.
// React Router-ийн замуудыг (/burtgel/irts гэх мэт) index.html руу чиглүүлнэ.
// Distribution-ий "custom error response"-оор SPA fallback хийвэл /api/* хариуны
// 403/404 ч index.html болж хувирдаг тул энэ функцийг ашиглана.
function handler(event) {
  var req = event.request;
  if (req.uri.indexOf('.') === -1) {
    req.uri = '/index.html';
  }
  return req;
}
