export function successResponse(data, meta = {}) {
  return {
    success: true,
    data,
    meta,
  };
}

export function errorResponse(message, code = 'BAD_REQUEST', details = []) {
  return {
    success: false,
    error: {
      message,
      code,
      details,
    },
  };
}
