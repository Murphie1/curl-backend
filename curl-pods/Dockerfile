FROM alpine
RUN apk add --no-cache curl
COPY run-curl.sh /run-curl.sh
RUN chmod +x /run-curl.sh
ENTRYPOINT ["/run-curl.sh"]
