default:
    @just --list

postgres-docker-start:
    docker run -d \
      --name pgdev \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=changethispassword \
      -e POSTGRES_DB=postgres \
      -p 5432:5432 \
      -v ~/docker/postgres-data:/var/lib/postgresql/data \
      postgres:15

postgres-docker-stop:
    docker stop pgdev
    docker rm pgdev
