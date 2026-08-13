FROM node:22-alpine

WORKDIR /app
COPY . .

ENV HOST=0.0.0.0
ENV PORT=10000
EXPOSE 10000

USER node
CMD ["node", "tools/arc_payment_receipt_server.mjs"]
